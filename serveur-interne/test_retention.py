import datetime as dt, unittest
from retention import choisir_a_garder

AUJ = dt.date(2026, 10, 25)

def jours(n, raison="quotidienne", heure=3):
    d = AUJ - dt.timedelta(days=n)
    return (f"b{n}-{raison}", dt.datetime(d.year, d.month, d.day, heure), raison)

class Retention(unittest.TestCase):
    def test_quotidien_30_jours(self):
        items = [jours(n) for n in range(0, 30)]
        self.assertEqual(choisir_a_garder(items, AUJ), {i[0] for i in items})

    def test_une_sauvegarde_par_jour_pendant_un_an_donne_le_bon_total(self):
        items = [jours(n) for n in range(0, 400)]
        g = choisir_a_garder(items, AUJ)
        quotidiennes = [i for i in items if (AUJ - i[1].date()).days < 30 and i[0] in g]
        self.assertEqual(len(quotidiennes), 30)
        # 12 hebdomadaires + 12 mensuels maximum au-delà (les mensuels peuvent coïncider avec des hebdomadaires)
        reste = [i for i in items if (AUJ - i[1].date()).days >= 30 and i[0] in g]
        self.assertTrue(12 <= len(reste) <= 25, len(reste))
        self.assertIn("b0-quotidienne", g)
        self.assertNotIn("b399-quotidienne", g, "plus de 12 mois : supprimée")

    def test_hebdomadaire_une_par_semaine(self):
        items = [jours(n) for n in range(30, 120)]
        g = choisir_a_garder(items, AUJ)
        semaines = {(i[1].isocalendar()[0], i[1].isocalendar()[1]) for i in items if i[0] in g and (AUJ - i[1].date()).days < 30 + 12 * 7}
        self.assertGreaterEqual(len(semaines), 11)
        par_semaine = {}
        for i in items:
            if i[0] in g and (AUJ - i[1].date()).days < 30 + 12 * 7:
                par_semaine.setdefault((i[1].isocalendar()[0], i[1].isocalendar()[1]), []).append(i)
        self.assertTrue(all(len(v) == 1 for v in par_semaine.values()))

    def test_mensuel_douze_mois(self):
        items = [jours(n) for n in range(0, 400)]
        g = choisir_a_garder(items, AUJ)
        mois = {(i[1].year, i[1].month) for i in items if i[0] in g and (AUJ - i[1].date()).days >= 30 + 12 * 7}
        self.assertTrue(len(mois) >= 6)

    def test_speciales_90_jours(self):
        items = [jours(5, "avant-migration"), jours(89, "avant-migration"), jours(91, "avant-migration"), jours(0)]
        g = choisir_a_garder(items, AUJ)
        self.assertIn("b5-avant-migration", g); self.assertIn("b89-avant-migration", g); self.assertNotIn("b91-avant-migration", g)

    def test_la_plus_recente_est_toujours_gardee(self):
        items = [jours(500), jours(520)]
        self.assertIn("b500-quotidienne", choisir_a_garder(items, AUJ))

    def test_plusieurs_sauvegardes_le_meme_jour_toutes_gardees_si_recentes(self):
        items = [("a", dt.datetime(2026, 10, 25, 3), "quotidienne"), ("b", dt.datetime(2026, 10, 25, 14), "manuelle")]
        self.assertEqual(choisir_a_garder(items, AUJ), {"a", "b"})

if __name__ == "__main__":
    unittest.main()
