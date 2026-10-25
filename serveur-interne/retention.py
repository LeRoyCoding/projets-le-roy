#!/usr/bin/env python3
"""Rotation des sauvegardes : 30 jours en quotidien, 12 semaines en hebdomadaire, 12 mois en mensuel.

Règles (sur les sauvegardes « quotidienne » et « manuelle ») :
  - quotidien   : on garde TOUT ce qui a moins de 30 jours ;
  - hebdomadaire: au-delà, on garde la plus récente de chaque semaine (lundi-dimanche) pendant 12 semaines ;
  - mensuel     : au-delà, on garde la plus récente de chaque mois pendant 12 mois.
Les sauvegardes « avant-migration » et « avant-restauration » sont gardées 90 jours.
Garde-fous : la plus récente n'est jamais supprimée ; en mode réel, on refuse de supprimer plus de la moitié des fichiers d'un coup.

Utilisation : retention.py DOSSIER [--appliquer] [--aujourdhui AAAA-MM-JJ]   (sans --appliquer : simulation)
"""
import argparse, datetime as dt, json, os, sys

JOURS_QUOTIDIEN, SEMAINES, MOIS, JOURS_SPECIALES = 30, 12, 12, 90
SPECIALES = ("avant-migration", "avant-restauration")


def choisir_a_garder(items, aujourdhui):
    """items : liste de (identifiant, datetime, raison). Renvoie l'ensemble des identifiants à conserver."""
    garder = set()
    normales = sorted((i for i in items if i[2] not in SPECIALES), key=lambda i: i[1], reverse=True)
    for ident, quand, raison in items:
        if raison in SPECIALES and (aujourdhui - quand.date()).days < JOURS_SPECIALES:
            garder.add(ident)
    semaines, mois = set(), set()
    for ident, quand, _ in normales:
        age = (aujourdhui - quand.date()).days
        if age < JOURS_QUOTIDIEN:
            garder.add(ident)
        elif age < JOURS_QUOTIDIEN + SEMAINES * 7:
            iso = quand.isocalendar()
            if (iso[0], iso[1]) not in semaines:        # la plus récente de chaque semaine
                semaines.add((iso[0], iso[1]))
                garder.add(ident)
        else:
            age_mois = (aujourdhui.year - quand.year) * 12 + aujourdhui.month - quand.month
            if age_mois <= MOIS and (quand.year, quand.month) not in mois:   # la plus récente de chaque mois
                mois.add((quand.year, quand.month))
                garder.add(ident)
    if normales:
        garder.add(normales[0][0])   # la plus récente est sacrée
    return garder


def lire(dossier):
    items = []
    for f in sorted(os.listdir(dossier)):
        if not f.endswith(".manifest.json"):
            continue
        try:
            m = json.load(open(os.path.join(dossier, f), encoding="utf-8"))
            quand = dt.datetime.strptime(m["created_at"].replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
        except Exception as e:  # manifeste illisible : on ne touche à rien
            print("manifeste illisible, ignoré :", f, e, file=sys.stderr)
            continue
        items.append((f[: -len(".manifest.json")], quand, m.get("reason", "")))
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dossier")
    ap.add_argument("--appliquer", action="store_true")
    ap.add_argument("--aujourdhui")
    a = ap.parse_args()
    aujourdhui = dt.date.fromisoformat(a.aujourdhui) if a.aujourdhui else dt.datetime.now(dt.timezone.utc).date()
    items = lire(a.dossier)
    garder = choisir_a_garder(items, aujourdhui)
    a_supprimer = [i for i in items if i[0] not in garder]
    print(f"{len(items)} sauvegarde(s) : {len(garder)} à garder, {len(a_supprimer)} à supprimer" + ("" if a.appliquer else " (simulation)"))
    if a.appliquer and len(a_supprimer) > max(3, len(items) // 2):
        print("REFUS : trop de suppressions d'un coup, vérifier d'abord (relancer avec --simulation).", file=sys.stderr)
        return 2
    for ident, quand, raison in a_supprimer:
        print(("supprime " if a.appliquer else "supprimerait ") + ident, quand.date(), raison)
        if a.appliquer:
            for f in os.listdir(a.dossier):
                if f.startswith(ident + ".") :
                    os.remove(os.path.join(a.dossier, f))
    return 0


if __name__ == "__main__":
    sys.exit(main())
