CREATE TABLE titulaire (
  id                  TEXT PRIMARY KEY,
  cree_le             TEXT NOT NULL,
  etat                TEXT NOT NULL DEFAULT 'en_attente'
                      CHECK (etat IN ('en_attente','actif','surveille','limite','suspendu','revoque','refuse')),
  nom                 TEXT NOT NULL,
  numero_membre       TEXT NOT NULL UNIQUE,
  section             TEXT NOT NULL,
  courriel            TEXT NOT NULL UNIQUE,
  cabinet             TEXT,
  courriel_verifie_le TEXT,
  attestation_le      TEXT NOT NULL,
  attestation_ver     TEXT NOT NULL,
  cgu_ver             TEXT NOT NULL,
  hybride_permis      INTEGER NOT NULL DEFAULT 1 CHECK (hybride_permis IN (0, 1)),
  note_admission      TEXT
);

CREATE TABLE invitation_acces (
  id              TEXT PRIMARY KEY,
  empreinte_code  TEXT NOT NULL UNIQUE,
  courriel_cible  TEXT,
  cohorte         TEXT,
  cree_le         TEXT NOT NULL,
  expire_le       TEXT NOT NULL CHECK (length(expire_le) = 24 AND substr(expire_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(expire_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(expire_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'),
  consomme_le     TEXT CHECK (consomme_le IS NULL OR (length(consomme_le) = 24 AND substr(consomme_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(consomme_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(consomme_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z')),
  titulaire_id    TEXT REFERENCES titulaire(id) ON DELETE CASCADE
);
CREATE INDEX ia_par_expiration ON invitation_acces(titulaire_id, expire_le);

CREATE TABLE demande_acces (
  id               TEXT PRIMARY KEY,
  empreinte_jeton  TEXT NOT NULL UNIQUE,
  invitation_id    TEXT REFERENCES invitation_acces(id) ON DELETE SET NULL,
  nom              TEXT NOT NULL,
  numero_membre    TEXT NOT NULL,
  section          TEXT NOT NULL,
  courriel         TEXT NOT NULL,
  cabinet          TEXT,
  attestation_le   TEXT NOT NULL,
  attestation_ver  TEXT NOT NULL,
  cgu_ver          TEXT NOT NULL,
  coffre_version   INTEGER,
  coffre_iv        BLOB,
  coffre_chiffre   BLOB,
  coffre_repere    TEXT,
  coffre_empreinte TEXT,
  cree_le          TEXT NOT NULL,
  expire_le        TEXT NOT NULL CHECK (length(expire_le) = 24 AND substr(expire_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(expire_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(expire_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'),
  consomme_le      TEXT CHECK (consomme_le IS NULL OR (length(consomme_le) = 24 AND substr(consomme_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(consomme_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(consomme_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z')),
  CHECK (
    (coffre_version IS NULL AND coffre_iv IS NULL AND coffre_chiffre IS NULL AND coffre_repere IS NULL AND coffre_empreinte IS NULL)
    OR
    (coffre_version IS NOT NULL AND coffre_iv IS NOT NULL AND coffre_chiffre IS NOT NULL AND coffre_repere IS NOT NULL AND coffre_empreinte IS NOT NULL)
  )
);
CREATE INDEX da_par_expiration ON demande_acces(expire_le);
CREATE INDEX da_consommee ON demande_acces(consomme_le) WHERE consomme_le IS NOT NULL;
CREATE INDEX da_par_courriel ON demande_acces(courriel, cree_le);
CREATE INDEX da_par_invitation ON demande_acces(invitation_id);

CREATE TABLE jeton (
  id            TEXT PRIMARY KEY,
  titulaire_id  TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  empreinte     TEXT NOT NULL UNIQUE,
  queue         TEXT NOT NULL,
  libelle       TEXT NOT NULL,
  portee        TEXT NOT NULL DEFAULT 'les_deux'
                CHECK (portee IN ('les_deux','jurisprudence','legislation')),
  emis_le       TEXT NOT NULL,
  expire_le     TEXT,
  revoque_le    TEXT,
  motif_revoc   TEXT CHECK (motif_revoc IS NULL OR motif_revoc IN ('rotation','titulaire','exploitant','expiration','compromission')),
  vu_le         TEXT
);
CREATE INDEX jeton_actif ON jeton(empreinte) WHERE revoque_le IS NULL;
CREATE INDEX jeton_par_titulaire ON jeton(titulaire_id);

CREATE TABLE coffre_clef (
  titulaire_id   TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  usage          TEXT NOT NULL,
  version        INTEGER NOT NULL,
  iv             BLOB NOT NULL,
  chiffre        BLOB NOT NULL,
  repere         TEXT NOT NULL,
  empreinte_clef TEXT NOT NULL,
  pose_le        TEXT NOT NULL,
  eprouve_le     TEXT,
  etat           TEXT NOT NULL CHECK (etat IN ('valide','refusee','inconnue')),
  PRIMARY KEY (titulaire_id, usage)
);
CREATE INDEX cc_par_empreinte ON coffre_clef(usage, empreinte_clef);

CREATE TABLE session_portail (
  id            TEXT PRIMARY KEY,
  titulaire_id  TEXT REFERENCES titulaire(id) ON DELETE CASCADE,
  courriel      TEXT NOT NULL,
  type_lien     TEXT NOT NULL CHECK (type_lien IN ('verification_courriel','connexion_moi','session_moi')),
  empreinte     TEXT NOT NULL UNIQUE,
  cree_le       TEXT NOT NULL,
  expire_le     TEXT NOT NULL CHECK (length(expire_le) = 24 AND substr(expire_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(expire_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(expire_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'),
  consomme_le   TEXT CHECK (consomme_le IS NULL OR (length(consomme_le) = 24 AND substr(consomme_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(consomme_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(consomme_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'))
);
CREATE INDEX sp_par_expiration ON session_portail(expire_le);
CREATE INDEX sp_consommee ON session_portail(consomme_le) WHERE consomme_le IS NOT NULL;
CREATE INDEX sp_par_titulaire ON session_portail(titulaire_id);

CREATE TABLE client_oauth (
  client_id             TEXT PRIMARY KEY,
  libelle               TEXT NOT NULL,
  empreinte_secret      TEXT,
  uris_redirection_json TEXT NOT NULL,
  portees_permises      TEXT NOT NULL DEFAULT 'les_deux',
  actif                 INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  cree_le               TEXT NOT NULL
);

CREATE TABLE code_oauth (
  id                  TEXT PRIMARY KEY,
  titulaire_id        TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  empreinte_code      TEXT NOT NULL UNIQUE,
  client_id           TEXT NOT NULL,
  redirect_uri        TEXT NOT NULL,
  portee              TEXT NOT NULL CHECK (portee IN ('les_deux','jurisprudence','legislation')),
  defi_pkce           TEXT NOT NULL,
  methode_pkce        TEXT NOT NULL CHECK (methode_pkce IN ('S256')),
  cree_le             TEXT NOT NULL,
  expire_le           TEXT NOT NULL CHECK (length(expire_le) = 24 AND substr(expire_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(expire_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(expire_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'),
  consomme_le         TEXT CHECK (consomme_le IS NULL OR (length(consomme_le) = 24 AND substr(consomme_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(consomme_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(consomme_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'))
);
CREATE INDEX co_par_expiration ON code_oauth(expire_le);
CREATE INDEX co_consomme ON code_oauth(consomme_le) WHERE consomme_le IS NOT NULL;
CREATE INDEX co_par_titulaire ON code_oauth(titulaire_id);

CREATE TABLE compteur_jour (
  titulaire_id  TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  jour          TEXT NOT NULL CHECK (length(jour) = 10 AND jour GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  classe        TEXT NOT NULL CHECK (classe IN ('local','sortant','semantique')),
  appels        INTEGER NOT NULL DEFAULT 0,
  erreurs       INTEGER NOT NULL DEFAULT 0,
  introuvables  INTEGER NOT NULL DEFAULT 0,
  sortants      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (titulaire_id, jour, classe)
);
CREATE INDEX cj_par_jour ON compteur_jour(jour);

CREATE TABLE evenement_technique (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulaire_id  TEXT NOT NULL,
  jeton_id      TEXT NOT NULL,
  service       TEXT NOT NULL,
  minute        TEXT NOT NULL CHECK (length(minute) = 16 AND substr(minute, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(minute, 11, 6) GLOB 'T[0-2][0-9]:[0-5][0-9]'),
  outil         TEXT NOT NULL,
  classe        TEXT NOT NULL CHECK (classe IN ('local','sortant','semantique')),
  issue         TEXT NOT NULL CHECK (issue IN ('ok','introuvable','erreur_usager','erreur_amont','refus','quota')),
  code          TEXT CHECK (code IS NULL OR code IN ('ARGUMENTS_INVALIDES','OUTIL_INCONNU','CLEF_ABSENTE','CLEF_REFUSEE','QUOTA_EPUISE','HORS_SERVICE','AMONT_HORS_SERVICE','AMONT_ERREUR','HYBRIDE_DESACTIVE','ERREUR_INTERNE')),
  ms            INTEGER,
  sortants      INTEGER NOT NULL DEFAULT 0,
  client        TEXT
);
CREATE INDEX et_par_titulaire ON evenement_technique(titulaire_id, minute);
CREATE INDEX et_par_minute ON evenement_technique(minute);

CREATE TABLE registre_gouverne (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulaire_id  TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  le            TEXT NOT NULL,
  de            TEXT NOT NULL CHECK (de IN ('en_attente','actif','surveille','limite','suspendu','revoque','refuse')),
  vers          TEXT NOT NULL CHECK (vers IN ('en_attente','actif','surveille','limite','suspendu','revoque','refuse')),
  motif         TEXT NOT NULL CHECK (motif IN ('admission','refus_admission','quota_repete','anomalie_debit','clef_invalide','demande_titulaire','manquement_cgu','retablissement')),
  auteur        TEXT NOT NULL CHECK (auteur IN ('automate','exploitant')),
  notifie_le    TEXT
);
CREATE INDEX rg_par_titulaire ON registre_gouverne(titulaire_id, le);
