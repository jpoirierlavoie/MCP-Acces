-- Clients OAuth 2.1 publics pré-inscrits sans secret symétrique (PKCE S256 obligatoire, SPEC §9).
-- Les clients d'espace de travail Google Gemini App / Vertex AI supplémentaires peuvent être
-- enregistrés ou désactivés depuis `/exploitant` (`gestionExploitant`) ou par CIMD anti-SSRF.

INSERT OR IGNORE INTO client_oauth (
  client_id, libelle, empreinte_secret, uris_redirection_json, portees_permises, actif, cree_le
) VALUES
  (
    'claude-web',
    'Claude et Claude Research (Anthropic)',
    NULL,
    '["https://claude.ai/api/mcp/auth_callback","https://claude.com/api/mcp/auth_callback"]',
    'les_deux legislation jurisprudence',
    1,
    '2026-11-18T00:00:00.000Z'
  ),
  (
    'google-vertex-gemini',
    'Google Cloud Vertex AI / Gemini Enterprise',
    NULL,
    '["https://vertexaisearch.cloud.google.com/oauth-redirect","https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"]',
    'les_deux legislation jurisprudence',
    1,
    '2026-11-18T00:00:00.000Z'
  ),
  (
    'cli-boucle-locale',
    'Client local en ligne de commande (RFC 8252 boucle locale)',
    NULL,
    '["http://127.0.0.1/callback","http://127.0.0.1/oauth/callback","http://localhost/callback","http://localhost/oauth/callback","http://[::1]/callback","http://[::1]/oauth/callback"]',
    'les_deux legislation jurisprudence',
    1,
    '2026-11-18T00:00:00.000Z'
  );
