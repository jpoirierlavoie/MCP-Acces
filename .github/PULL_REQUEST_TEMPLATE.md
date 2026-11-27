## Résumé / Summary

## Vérifications locales / Local Verification

- [ ] `npm run type-check` (`tsc --noEmit`)
- [ ] `npm run lint` (`biome check .`)
- [ ] `npm test` (`vitest run` sous `workerd` + D1)
- [ ] `npm run audit` (`0` vulnérabilité prod + parité `osv-scanner.toml`)

## Évaluation d'impact obligatoire (4 axes — `CLAUDE.md` / `GEMINI.md`)

1. **Code, routes, migrations D1 `mcp-identite` et tests (`src/`, `migrations/`, `test/`) :**
2. **`README.md`, `SECURITY.md`, `LICENSE` et configuration Wrangler :**
3. **Pages publiques HTML (`GET /` et les 5 documents `/cgu`, `/confidentialite`, `/attestation`, `/conformite`, `/gouverne`) :**
4. **Impacts inter-dépôts (`MCP-Socle`, `MCP-Legislation`, `MCP-Jurisprudence`, `MCP-Outils`, `droit-civil-quebecois`) :**

## Confidentialité et sécurité

- [ ] Aucun secret (`CONSOLE_TOKEN`, `COFFRE_MAITRE_*`, `Bearer`, clé API CanLII), aucun chemin local personnel et aucune donnée client confidentielle ou privilégiée dans les commits ni dans cette PR.
