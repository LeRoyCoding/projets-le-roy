// Préparation à l'intranet : fournisseur d'identité interchangeable, rattachement d'identités externes, données métier intactes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const { demarrer, equipe, tache } = require('./aide');

let srv, E;
before(async () => { srv = await demarrer(); E = await equipe(srv); });
after(() => srv.stop());
const php = code => spawnSync('php', ['-r', `putenv('LR_TESTING=1'); require '${path.join(__dirname, '..', 'www', 'api', 'lib.php')}'; define('APP_VERSION','x'); const GROUP_COLORS = ['#C4122F','#666A6F','#2E8C76','#D08A1E','#3F7CC0','#7A5AB5']; ${code}`], { env: { ...process.env, ...srv.env }, encoding: 'utf8' });

test('le fournisseur « local » est branché derrière une interface', () => {
  const r = php("echo get_class(auth_provider()), ' ', auth_provider()->name(), ' ', (auth_provider() instanceof AuthProvider) ? 'ok' : 'non';");
  assert.equal(r.stdout.trim(), 'LocalAuthProvider local ok');
});

test('un fournisseur inconnu est refusé clairement', () => {
  const r = spawnSync('php', ['-r', `putenv('LR_TESTING=1'); require '${path.join(__dirname, '..', 'www', 'api', 'lib.php')}'; try { auth_provider(); } catch (HttpError $e) { echo $e->getMessage(); }`], { env: { ...process.env, ...srv.env, LR_TEST_AUTH_PROVIDER: 'x' }, encoding: 'utf8' });
  assert.match(r.stdout, /Fournisseur d'authentification inconnu : x/);
});

test('identité externe : rattachée à un compte Projets (créé une fois), sans toucher aux données métier', async () => {
  const avant = (await E.antoine.state()).tasks.length;
  const id1 = php("echo json_encode(user_from_identity(['source' => 'intranet', 'external_id' => 'U-42', 'name' => 'Jean Dupont', 'email' => 'jean@le-roy.fr']));").stdout;
  const u1 = JSON.parse(id1);
  assert.equal(u1.name, 'Jean Dupont'); assert.equal(u1.role, 'user');
  const u2 = JSON.parse(php("echo json_encode(user_from_identity(['source' => 'intranet', 'external_id' => 'U-42', 'name' => 'Autre nom']));").stdout);
  assert.equal(u2.id, u1.id, 'même personne : même compte');
  // Un nom déjà pris par un compte local n'est pas volé
  const u3 = JSON.parse(php("echo json_encode(user_from_identity(['source' => 'intranet', 'external_id' => 'U-43', 'name' => 'Antoine']));").stdout);
  assert.notEqual(u3.id, E.ids.a);
  assert.match(u3.name, /Antoine \(intranet\)/);
  // Pas d'administrateur par défaut, même si l'intranet le demande
  const u4 = JSON.parse(php("echo json_encode(user_from_identity(['source' => 'intranet', 'external_id' => 'U-44', 'name' => 'Chef', 'admin' => true]));").stdout);
  assert.equal(u4.role, 'user');
  const u5 = JSON.parse(php("echo json_encode(user_from_identity(['source' => 'intranet', 'external_id' => 'U-45', 'name' => 'Chef2', 'admin' => true], true));").stdout);
  assert.equal(u5.role, 'admin');
  // L'usurpation d'un compte local est impossible
  assert.match(php("try { user_from_identity(['source' => 'local', 'external_id' => '1', 'name' => 'X']); } catch (HttpError $e) { echo 'refusé'; }").stdout, /refusé/);
  // Les données métier n'ont pas bougé, le compte externe a son groupe Perso, et ne peut pas se connecter par mot de passe local
  assert.equal((await E.antoine.state()).tasks.length, avant);
  assert.equal(srv.cli('migrer.php').stdout.includes('ok'), true);
  assert.equal((await srv.client().login('Jean Dupont', 'nimporte-quoi-1234')).status, 401);
  const admin = srv.client(); await admin.login('Administrateur', require('./aide').ADMIN_PW);
  const st = await admin.state();
  assert.equal(st.users.find(u => u.id === u1.id).source, 'intranet');
  assert.ok(st.groups.some(g => g.name === 'Perso' && g.members.includes(u1.id)));
});
