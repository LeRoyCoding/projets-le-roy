#!/usr/bin/env python3
"""Test de restauration : restaure la sauvegarde la plus récente dans une base TEMPORAIRE de test, compare les lignes, supprime la base.

Ne touche JAMAIS à la production : il n'utilise que la base locale décrite par TEST_DB_* et ne crée/supprime que des bases dont le nom
commence par TEST_DB_PREFIX. Dépendances : python3, openssl, gzip, client « mysql ».
Utilisation : tester-restauration.py DOSSIER_SAUVEGARDES   (variables : PRIVATE_KEY, TEST_DB_HOST, TEST_DB_USER, TEST_DB_PASS, TEST_DB_PREFIX)
Code de sortie : 0 = restauration identique ; 1 = échec.
"""
import base64, glob, gzip, hashlib, hmac, json, os, shutil, subprocess, sys, tempfile, datetime as dt


def sh(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw)


def plus_recente(dossier):
    manifestes = sorted(glob.glob(os.path.join(dossier, "projets-*.manifest.json")))
    if not manifestes:
        raise SystemExit("Aucune sauvegarde à tester.")
    return manifestes[-1]


def dechiffrer(fichier, enc, cle_privee, sortie):
    cle = sh(["openssl", "pkeyutl", "-decrypt", "-inkey", cle_privee, "-pkeyopt", "rsa_padding_mode:oaep"], input=base64.b64decode(enc["key_wrapped"])).stdout
    if len(cle) != 64:
        raise SystemExit("Clé de session invalide : mauvaise clé privée ?")
    cle_aes, cle_mac = cle[:32], cle[32:]
    mac = hmac.new(cle_mac, bytes.fromhex(enc["iv"]), hashlib.sha256)
    with open(fichier, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            mac.update(bloc)
    if not hmac.compare_digest(mac.hexdigest(), enc["hmac_sha256"]):
        raise SystemExit("Intégrité : le fichier chiffré est altéré ou corrompu.")
    sh(["openssl", "enc", "-d", "-aes-256-cbc", "-K", cle_aes.hex(), "-iv", enc["iv"], "-in", fichier, "-out", sortie])


def main():
    dossier = sys.argv[1]
    host, user = os.environ.get("TEST_DB_HOST", "127.0.0.1"), os.environ.get("TEST_DB_USER", "root")
    prefix = os.environ.get("TEST_DB_PREFIX", "lr_restore_")
    env = {**os.environ, "MYSQL_PWD": os.environ.get("TEST_DB_PASS", "")}
    mysql = ["mysql", "-h", host, "-u", user, "--default-character-set=utf8mb4"]
    manifeste = plus_recente(dossier)
    m = json.load(open(manifeste, encoding="utf-8"))
    src = os.path.join(dossier, m["file"])
    tmp = tempfile.mkdtemp(prefix="lr-test-")
    base = f"{prefix}{dt.datetime.now(dt.timezone.utc):%Y%m%d%H%M%S}"
    assert base.startswith(prefix) and base.replace("_", "").isalnum()
    try:
        gz = os.path.join(tmp, "dump.sql.gz")
        if m.get("encrypted"):
            cle = os.environ.get("PRIVATE_KEY")
            if not cle or not os.path.exists(cle):
                raise SystemExit("PRIVATE_KEY manquante : impossible de déchiffrer la sauvegarde.")
            dechiffrer(src, m["encryption"], cle, gz)
        else:
            shutil.copy(src, gz)
        sql = os.path.join(tmp, "dump.sql")
        with gzip.open(gz, "rb") as a, open(sql, "wb") as b:
            shutil.copyfileobj(a, b)
        fin = open(sql, "rb").read()[-200:]
        if b"-- LRBACKUP END" not in fin:
            raise SystemExit("Fichier tronqué : marqueur de fin absent.")
        subprocess.run(mysql + ["-e", f"CREATE DATABASE `{base}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"], check=True, env=env, capture_output=True)
        with open(sql, "rb") as f:
            r = subprocess.run(mysql + [base], stdin=f, env=env, capture_output=True)
        if r.returncode != 0:
            raise SystemExit("Restauration impossible : " + r.stderr.decode("utf-8", "replace")[:400])
        mauvais = []
        for table, attendu in m["tables"].items():
            n = sh(mysql + ["-N", "-e", f"SELECT COUNT(*) FROM `{base}`.`{table}`"], env=env).stdout.decode().strip()
            if int(n) != int(attendu):
                mauvais.append(f"{table}: {n} au lieu de {attendu}")
        if mauvais:
            raise SystemExit("Écarts après restauration : " + " ; ".join(mauvais))
        print(f"Test de restauration OK : {os.path.basename(src)} — {len(m['tables'])} tables, {sum(m['tables'].values())} lignes identiques.")
    finally:
        try:
            if base.startswith(prefix):
                subprocess.run(mysql + ["-e", f"DROP DATABASE IF EXISTS `{base}`"], env=env, capture_output=True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit("Commande en échec : " + " ".join(e.cmd[:3]) + " — " + (e.stderr or b"").decode("utf-8", "replace")[:300])
