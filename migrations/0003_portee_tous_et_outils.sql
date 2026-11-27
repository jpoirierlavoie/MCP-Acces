-- Migration 0003 : ajout du service 'outils' et de la portee universelle 'tous'
-- (retrocompatibilite conservee avec l'ancienne valeur 'les_deux' dans les tables).

CREATE TABLE jeton_nouveau (
  id            TEXT PRIMARY KEY,
  titulaire_id  TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  empreinte     TEXT NOT NULL UNIQUE,
  queue         TEXT NOT NULL,
  libelle       TEXT NOT NULL,
  portee        TEXT NOT NULL DEFAULT 'tous'
                CHECK (portee IN ('tous','les_deux','jurisprudence','legislation','outils','jurisprudence legislation','jurisprudence outils','legislation outils')),
  emis_le       TEXT NOT NULL,
  expire_le     TEXT,
  revoque_le    TEXT,
  motif_revoc   TEXT CHECK (motif_revoc IS NULL OR motif_revoc IN ('rotation','titulaire','exploitant','expiration','compromission')),
  vu_le         TEXT
);
INSERT INTO jeton_nouveau (
  id, titulaire_id, empreinte, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
)
SELECT
  id, titulaire_id, empreinte, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
FROM jeton;
DROP TABLE jeton;
ALTER TABLE jeton_nouveau RENAME TO jeton;
CREATE INDEX jeton_actif ON jeton(empreinte) WHERE revoque_le IS NULL;
CREATE INDEX jeton_par_titulaire ON jeton(titulaire_id);

CREATE TABLE code_oauth_nouveau (
  id                  TEXT PRIMARY KEY,
  titulaire_id        TEXT NOT NULL REFERENCES titulaire(id) ON DELETE CASCADE,
  empreinte_code      TEXT NOT NULL UNIQUE,
  client_id           TEXT NOT NULL,
  redirect_uri        TEXT NOT NULL,
  portee              TEXT NOT NULL CHECK (portee IN ('tous','les_deux','jurisprudence','legislation','outils','jurisprudence legislation','jurisprudence outils','legislation outils')),
  defi_pkce           TEXT NOT NULL,
  methode_pkce        TEXT NOT NULL CHECK (methode_pkce IN ('S256')),
  cree_le             TEXT NOT NULL,
  expire_le           TEXT NOT NULL CHECK (length(expire_le) = 24 AND substr(expire_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(expire_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(expire_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'),
  consomme_le         TEXT CHECK (consomme_le IS NULL OR (length(consomme_le) = 24 AND substr(consomme_le, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr(consomme_le, 11, 9) GLOB 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND substr(consomme_le, 20, 5) GLOB '.[0-9][0-9][0-9]Z'))
);
INSERT INTO code_oauth_nouveau (
  id, titulaire_id, empreinte_code, client_id, redirect_uri, portee, defi_pkce, methode_pkce, cree_le, expire_le, consomme_le
)
SELECT
  id, titulaire_id, empreinte_code, client_id, redirect_uri, portee, defi_pkce, methode_pkce, cree_le, expire_le, consomme_le
FROM code_oauth;
DROP TABLE code_oauth;
ALTER TABLE code_oauth_nouveau RENAME TO code_oauth;
CREATE INDEX co_par_expiration ON code_oauth(expire_le);
CREATE INDEX co_consomme ON code_oauth(consomme_le) WHERE consomme_le IS NOT NULL;
CREATE INDEX co_par_titulaire ON code_oauth(titulaire_id);

CREATE TABLE client_oauth_nouveau (
  client_id             TEXT PRIMARY KEY,
  libelle               TEXT NOT NULL,
  empreinte_secret      TEXT,
  uris_redirection_json TEXT NOT NULL,
  portees_permises      TEXT NOT NULL DEFAULT 'tous',
  actif                 INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  cree_le               TEXT NOT NULL
);
INSERT INTO client_oauth_nouveau (
  client_id, libelle, empreinte_secret, uris_redirection_json, portees_permises, actif, cree_le
)
SELECT
  client_id,
  libelle,
  empreinte_secret,
  uris_redirection_json,
  CASE
    WHEN portees_permises IN ('les_deux', 'les_deux legislation jurisprudence') THEN 'tous'
    ELSE portees_permises
  END,
  actif,
  cree_le
FROM client_oauth;
DROP TABLE client_oauth;
ALTER TABLE client_oauth_nouveau RENAME TO client_oauth;
