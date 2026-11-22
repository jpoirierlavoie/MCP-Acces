/**
 * Gabarit HTML et identité visuelle partagée (`acces.poirierlavoie.ca`), alignée sur les
 * connecteurs jumeaux `MCP-Legislation`, `MCP-Jurisprudence` et `MCP-Outils` :
 * - typographie Georgia, thèmes `CLAIR` / `SOMBRE` strictement symétriques, zéro couleur en dur ;
 * - bascule bilingue `FR · EN` sans requête et bascule de thème à trois états (`auto`, `light`, `dark`) ;
 * - politique CSP stricte à nonce cryptographique par réponse (`script-src 'nonce-...'`), zéro actif tiers,
 *   zéro en-tête CORS.
 */

import { frapperJeton } from "@poirierlavoie/mcp-socle";

/** Échappement HTML intégral appliqué à toute valeur interpolée. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Élément en ligne bilingue (`FR` + `EN` émis simultanément, filtrés en CSS). */
export function bi(fr: string, en: string): string {
  return `<span data-l="fr">${esc(fr)}</span><span data-l="en" lang="en">${esc(en)}</span>`;
}

/** Suite de paragraphes bilingues. */
export function biP(fr: readonly string[], en: readonly string[]): string {
  return (
    `<div data-l="fr">${fr.map((p) => `<p>${esc(p)}</p>`).join("")}</div>\n` +
    `<div data-l="en" lang="en">${en.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
  );
}

export interface SectionSommaire {
  readonly id: string;
  readonly fr: string;
  readonly en: string;
}

const CLAIR =
  "color-scheme:light;--f:#111;--m:#666;--b:#e2e0da;--a:#7a2e1d;--bg:#fdfcfa;--card:#fff;" +
  "--th:#f7f5f1;--code:#f2efe9;--hover:#faf8f4;--avert-bg:#fbf7f1;--avert-b:#e6d9c6;" +
  "--ok-bg:#f2f8f3;--ok-b:#b7d6bd;--err-bg:#fcf2f1;--err-b:#e3b4ae";

const SOMBRE =
  "color-scheme:dark;--f:#e8e6e1;--m:#a09a90;--b:#3a372f;--a:#e08b6a;--bg:#16150f;--card:#1e1c16;" +
  "--th:#252219;--code:#252219;--hover:#242118;--avert-bg:#211d15;--avert-b:#3d3527;" +
  "--ok-bg:#17241a;--ok-b:#2f5236;--err-bg:#291816;--err-b:#5c302b";

const LARGE = "78rem";
const SOLEIL = "☀︎";
const FLECHE = "↑︎";

function compacterBloc(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\/\/.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

const CSS = compacterBloc(`
:root{${CLAIR}}
@media(prefers-color-scheme:dark){:root{${SOMBRE}}}
html.t-light{${CLAIR}}
html.t-dark{${SOMBRE}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--f);font:16px/1.6 Georgia,'Times New Roman',serif}
.wrap{max-width:${LARGE};margin:0 auto;padding:2rem 1.25rem 4rem;display:grid;gap:1rem}
main{min-width:0;max-width:60rem;width:100%;justify-self:center}
section[id]{scroll-margin-top:1.5rem}
h1{font-size:1.6rem;margin:0}
h2{font-size:1.35rem;margin:2.5rem 0 .75rem;padding-bottom:.3rem;border-bottom:2px solid var(--b)}
h3{font-size:1.1rem;margin:1.5rem 0 .5rem}
h4{font-size:1rem;margin:1.1rem 0 .25rem}
p{margin:.6rem 0}
ul,ol{margin:.6rem 0;padding-left:1.4rem}
li{margin:.25rem 0}
a{color:var(--a)}
code{font:.9em ui-monospace,Menlo,Consolas,monospace;background:var(--code);padding:.1em .35em;border-radius:3px}
pre{background:var(--code);border:1px solid var(--b);border-radius:6px;padding:.7rem .9rem;
  overflow-x:auto;font-size:.84rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}
pre code{background:none;padding:0}
:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--a);outline-offset:2px}
.saut{position:fixed;left:1rem;top:1rem;z-index:20;padding:.45rem .85rem;background:var(--card);
  color:var(--a);border:2px solid var(--a);border-radius:6px;font-weight:700;text-decoration:none}
.saut:not(:focus-visible){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.suite{display:flex;align-items:center;justify-content:space-between;gap:.5rem 1rem;flex-wrap:wrap;
  margin:0 0 1rem;padding:0 0 .65rem;border-bottom:1px solid var(--b);font-size:.88rem}
.suite-t{font-weight:700;color:var(--m);letter-spacing:.02em}
.suite ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.35rem}
.suite li{margin:0}
.suite a{display:inline-block;padding:.28rem .65rem;border:1px solid transparent;border-radius:999px;
  color:var(--m);text-decoration:none;min-height:1.75rem}
.suite a:hover{color:var(--a);border-color:var(--b);background:var(--card)}
.suite a[aria-current=page]{color:var(--a);font-weight:700;border-color:var(--a);background:var(--card)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.btns{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
#bascule,#theme,.btn-sec{font:inherit;font-size:.82rem;letter-spacing:.03em;background:var(--card);
  border:1px solid var(--b);border-radius:999px;padding:.35rem .9rem;cursor:pointer;color:var(--m);
  text-decoration:none;white-space:nowrap;display:inline-block}
#bascule:hover,#theme:hover,.btn-sec:hover{border-color:var(--a);color:var(--a)}
#theme{min-width:6.5rem;text-align:center}
#theme [data-t]{display:none}
html:not(.t-light):not(.t-dark) #theme [data-t=auto],
html.t-light #theme [data-t=light],
html.t-dark #theme [data-t=dark]{display:inline}
.btn{font:inherit;font-size:.92rem;font-weight:700;background:var(--a);color:var(--bg);
  border:1px solid var(--a);border-radius:6px;padding:.5rem 1.1rem;cursor:pointer;text-decoration:none;
  display:inline-block}
.btn:hover{opacity:.92}
.btn-danger{font:inherit;font-size:.85rem;background:var(--err-bg);color:var(--f);
  border:1px solid var(--err-b);border-radius:6px;padding:.4rem .85rem;cursor:pointer}
.m{color:var(--m);font-size:.86rem}
.grille-cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(16.5rem,1fr));gap:.85rem;margin:1rem 0}
.grille-cartes .carte{margin:0;display:flex;flex-direction:column;justify-content:space-between}
.carte{border:1px solid var(--b);border-radius:6px;background:var(--card);padding:1rem 1.2rem;margin:1rem 0}
.carte h3{margin-top:0}
.avert{background:var(--avert-bg);border:1px solid var(--avert-b);border-radius:6px;padding:.6rem 1.1rem;margin:1rem 0}
.ok{background:var(--ok-bg);border:1px solid var(--ok-b);border-radius:6px;padding:.6rem 1.1rem;margin:1rem 0}
.err{background:var(--err-bg);border:1px solid var(--err-b);border-radius:6px;padding:.6rem 1.1rem;margin:1rem 0}
.badge{display:inline-block;font-size:.78rem;padding:.1rem .5rem;border-radius:999px;
  border:1px solid var(--avert-b);background:var(--avert-bg);color:var(--f)}
.champ{margin:.85rem 0}
.champ label{display:block;font-weight:700;margin-bottom:.25rem;font-size:.93rem}
.champ input[type=text],.champ input[type=email],.champ input[type=password],.champ select,.champ textarea{
  width:100%;max-width:34rem;padding:.48rem .65rem;font:inherit;font-size:.95rem;
  background:var(--bg);color:var(--f);border:1px solid var(--b);border-radius:5px}
.champ textarea{max-width:44rem;min-height:4.5rem}
.case{display:flex;gap:.55rem;align-items:flex-start;margin:.65rem 0}
.case input{margin-top:.2rem;width:1.15rem;height:1.15rem;flex-shrink:0}
.tw{overflow-x:auto;border:1px solid var(--b);border-radius:6px;background:var(--card);margin:.75rem 0}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:.5rem .7rem;text-align:left;border-bottom:1px solid var(--b);vertical-align:top}
th{background:var(--th);position:sticky;top:0}
td.n,th.n{text-align:right;white-space:nowrap}
tbody tr:hover{background:var(--hover)}
.tdm{max-width:60rem;width:100%;justify-self:center}
.tdm ul{list-style:none;margin:.5rem 0 0;padding:0;font-size:.85rem}
.tdm li{margin:.15rem 0}
.tdm a{display:block;padding:.25rem .6rem;border-left:2px solid var(--b);color:var(--m);text-decoration:none}
.tdm a:hover,.tdm a.on{color:var(--a);border-left-color:var(--a)}
.tdm a.on{font-weight:700}
details{border:1px solid var(--b);border-radius:6px;background:var(--card);margin:.6rem 0;padding:.6rem .9rem}
summary{cursor:pointer;font-weight:700}
footer{margin-top:3.5rem;padding-top:1.25rem;border-top:2px solid var(--b);font-size:.9rem;color:var(--m)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.haut{position:fixed;right:1.25rem;bottom:1.25rem;z-index:10;width:2.6rem;height:2.6rem;
  display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1.1rem;
  background:var(--card);color:var(--m);border:1px solid var(--b);border-radius:999px}
.haut:hover{color:var(--a);border-color:var(--a)}
html.js .haut{opacity:0;visibility:hidden}
html.js .haut.on{opacity:1;visibility:visible}
@media(prefers-reduced-motion:no-preference){
  html{scroll-behavior:smooth}
  .haut{transition:opacity .2s,visibility .2s,color .2s,border-color .2s}
}
@media(forced-colors:active){
  .suite a[aria-current=page],.tdm a.on{outline:2px solid Highlight}
}
html.l-fr [data-l=en],html.l-en [data-l=fr]{display:none}
@media(min-width:${LARGE}){
  .wrap.avec-tdm{grid-template-columns:13rem minmax(0,60rem);gap:2.5rem;align-items:start}
  .wrap.avec-tdm main,.wrap.avec-tdm .tdm{max-width:none}
  .wrap.avec-tdm .tdm{position:sticky;top:2rem;border:0;background:none;margin:0;padding:0;
    max-height:calc(100vh - 4rem);overflow:auto}
  .wrap.avec-tdm .tdm>summary{display:none}
}
`);

// biome-ignore lint/complexity/noUselessStringRaw: parade délibérée contre la perte d'antislash
const BOOT = compacterBloc(String.raw`
try{
  var r=document.documentElement, c=[];
  var p=localStorage.getItem('accesLang')||(navigator.language||'fr').slice(0,2);
  c.push(p==='en'?'l-en':'l-fr'); r.lang=(p==='en'?'en':'fr');
  var t=localStorage.getItem('accesTheme');
  if(t==='light'||t==='dark') c.push('t-'+t);
  r.className=c.join(' ');
  var ti=document.querySelector&&document.querySelector('title[data-en]');
  if(ti&&p==='en') document.title=ti.getAttribute('data-en');
}catch(e){}
`);

const BOOT_FR_SEUL = compacterBloc(`
try{
  var r=document.documentElement, c=['l-fr'];
  var t=localStorage.getItem('accesTheme');
  if(t==='light'||t==='dark') c.push('t-'+t);
  r.className=c.join(' ');
}catch(e){}
`);

const JS = `
(function(){
  var d=document, h=d.documentElement;

  var b=d.getElementById('bascule');
  if(b) b.addEventListener('click',function(){
    var nv=h.classList.contains('l-en')?'fr':'en';
    h.classList.toggle('l-fr',nv==='fr'); h.classList.toggle('l-en',nv==='en');
    h.lang=nv;
    var ti=d.querySelector('title[data-en]');
    if(ti) d.title=ti.getAttribute(nv==='en'?'data-en':'data-fr')||d.title;
    try{localStorage.setItem('accesLang',nv);}catch(e){}
  });

  var tb=d.getElementById('theme');
  if(tb) tb.addEventListener('click',function(){
    var cur=h.classList.contains('t-light')?'light'
           :h.classList.contains('t-dark')?'dark':'auto';
    var nx=cur==='auto'?'light':cur==='light'?'dark':'auto';
    h.classList.remove('t-light'); h.classList.remove('t-dark');
    if(nx!=='auto') h.classList.add('t-'+nx);
    try{
      if(nx==='auto') localStorage.removeItem('accesTheme');
      else localStorage.setItem('accesTheme',nx);
    }catch(e){}
  });

  var td=d.querySelector('.tdm');
  if(td){
    try{
      var mq=matchMedia('(min-width:LARGEUR)');
      var sync=function(){td.open=mq.matches;};
      sync();
      if(mq.addEventListener) mq.addEventListener('change',sync);
      else if(mq.addListener) mq.addListener(sync);
    }catch(e){}
    try{
      var liens=[].slice.call(td.querySelectorAll('a'));
      var cibles=liens.map(function(a){return d.getElementById(a.getAttribute('href').slice(1));});
      var io=new IntersectionObserver(function(es){
        for(var n=0;n<es.length;n++){
          if(!es[n].isIntersecting) continue;
          var k=cibles.indexOf(es[n].target); if(k<0) continue;
          for(var j=0;j<liens.length;j++) liens[j].classList.remove('on');
          liens[k].classList.add('on');
        }
      },{rootMargin:'0px 0px -70% 0px'});
      for(var n2=0;n2<cibles.length;n2++) if(cibles[n2]) io.observe(cibles[n2]);
    }catch(e){}
  }

  var ht=d.querySelector('.haut');
  if(ht){
    try{
      h.classList.add('js');
      var seuil=function(){return (window.innerHeight||600)*0.8;};
      var maj=function(){
        var y=window.pageYOffset||d.documentElement.scrollTop||0;
        if(y>seuil()) ht.classList.add('on'); else ht.classList.remove('on');
      };
      maj();
      window.addEventListener('scroll',maj,{passive:true});
    }catch(e){}
  }
})();
`;

const JS_COMPACTE = (() => {
  if (!JS.includes("LARGEUR")) throw new Error("jeton LARGEUR absent du JS client");
  return compacterBloc(JS.replace("LARGEUR", LARGE));
})();

function etatTheme(t: string, fr: string, en: string, bilingue: boolean): string {
  return `<span data-t="${t}">${bilingue ? bi(fr, en) : esc(fr)}</span>`;
}

export function boutonsEntete(bilingue: boolean): string {
  const boutonTheme = `<button id="theme" type="button" title="Thème / Theme">${etatTheme("auto", "◐ Auto", "◐ Auto", bilingue)}${etatTheme("light", `${SOLEIL} Clair`, `${SOLEIL} Light`, bilingue)}${etatTheme("dark", "☾ Sombre", "☾ Dark", bilingue)}</button>`;
  const boutonLangue = bilingue
    ? `<button id="bascule" type="button" title="Français / English">FR&nbsp;·&nbsp;EN</button>`
    : "";
  return `<div class="btns">${boutonTheme}${boutonLangue}</div>`;
}

/** Barre de navigation inter-connecteurs de la suite `Droit civil québécois`. */
export function barreSuite(bilingue: boolean, estAccueil = false): string {
  const txt = (fr: string, en: string) => (bilingue ? bi(fr, en) : esc(fr));
  const attrAccueil = estAccueil ? ' aria-current="page"' : "";
  return `<nav class="suite" aria-labelledby="suite-t">
<span id="suite-t" class="sr">${txt("Suite Droit civil québécois", "Québec Civil Law suite")}</span>
<span class="suite-t">${txt("Droit civil québécois", "Québec Civil Law")}</span>
<ul>
<li><a href="/"${attrAccueil}>${txt("Accès", "Access")}</a></li>
<li><a href="https://legislation.poirierlavoie.ca/">${txt("Législation", "Legislation")}</a></li>
<li><a href="https://jurisprudence.poirierlavoie.ca/">${txt("Jurisprudence", "Case Law")}</a></li>
<li><a href="https://outils.poirierlavoie.ca/">${txt("Outils", "Tools")}</a></li>
</ul>
</nav>`;
}

function rendreSautContenu(bilingue: boolean): string {
  const libelle = bilingue
    ? bi("Aller au contenu principal", "Skip to main content")
    : esc("Aller au contenu principal");
  return `<a href="#contenu-principal" class="saut">${libelle}</a>`;
}

function rendreSommaire(sections: readonly SectionSommaire[]): string {
  const items = sections
    .map((s) => `<li><a href="#${esc(s.id)}">${bi(s.fr, s.en)}</a></li>`)
    .join("");
  return `<details class="tdm" open>
<summary id="tdm-t">${bi("Sommaire", "Contents")}</summary>
<nav aria-labelledby="tdm-t"><ul>${items}</ul></nav>
</details>`;
}

function rendrePastilleHaut(bilingue: boolean): string {
  const libelle = bilingue ? bi("Haut de page", "Back to top") : esc("Haut de page");
  return (
    `<a href="#top" class="haut"><span aria-hidden="true">${FLECHE}</span>` +
    `<span class="sr">${libelle}</span></a>`
  );
}

export interface OptionsPageHtml {
  readonly titrePage: string;
  readonly titrePageEn?: string;
  readonly descriptionMeta: string;
  readonly corpsHtml: string;
  readonly sections?: readonly SectionSommaire[];
  readonly bilingue?: boolean;
  readonly noindex?: boolean;
  readonly statut?: number;
  readonly method?: string;
  readonly formAction?: string;
  readonly cachePublicMaxAge?: number;
  readonly referrerPolicy?: "no-referrer" | "same-origin" | "strict-origin-when-cross-origin";
  readonly entetesSupplementaires?: Record<string, string>;
  readonly urlCanonique?: string;
  readonly jsonLd?: Record<string, unknown>;
}

/**
 * Construit une `Response` HTML complète protégée par CSP stricte à nonce unique, sans actif tiers
 * ni en-tête CORS.
 */
export function repondrePageHtml(options: OptionsPageHtml): Response {
  const nonce = frapperJeton();
  const bilingue = options.bilingue ?? false;
  const formAction = options.formAction ?? "'none'";
  const cacheControl =
    options.cachePublicMaxAge !== undefined
      ? `public, max-age=${options.cachePublicMaxAge}`
      : "no-store";
  const referrerPolicy =
    options.referrerPolicy ??
    (options.cachePublicMaxAge !== undefined
      ? "strict-origin-when-cross-origin"
      : formAction === "'none'"
        ? "no-referrer"
        : "same-origin");

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; ` +
      `img-src data:; base-uri 'none'; form-action ${formAction}; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": referrerPolicy,
    "Cache-Control": cacheControl,
  });

  if (options.entetesSupplementaires) {
    for (const [k, v] of Object.entries(options.entetesSupplementaires)) {
      headers.set(k, v);
    }
  }

  const statut = options.statut ?? 200;
  if (options.method === "HEAD") {
    return new Response(null, { status: statut, headers });
  }

  const metaDecouverte = options.urlCanonique
    ? `\n<link rel="canonical" href="${esc(options.urlCanonique)}">` +
      `\n<meta property="og:type" content="website">` +
      `\n<meta property="og:title" content="${esc(options.titrePage)}">` +
      `\n<meta property="og:description" content="${esc(options.descriptionMeta)}">` +
      `\n<meta property="og:url" content="${esc(options.urlCanonique)}">` +
      `\n<meta property="og:locale" content="fr_CA">` +
      (bilingue ? `\n<meta property="og:locale:alternate" content="en_CA">` : "")
    : "";

  const blocJsonLd = options.jsonLd
    ? `\n<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(options.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  const attrTitre = options.titrePageEn
    ? ` data-fr="${esc(options.titrePage)}" data-en="${esc(options.titrePageEn)}"`
    : "";
  const metaRobots = options.noindex ? '\n<meta name="robots" content="noindex">' : "";
  const avecTdm = options.sections !== undefined && options.sections.length > 0;
  const html = `<!doctype html>
<html lang="fr" class="l-fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title${attrTitre}>${esc(options.titrePage)}</title>
<meta name="description" content="${esc(options.descriptionMeta)}">${metaRobots}${metaDecouverte}
<style>${CSS}</style>${blocJsonLd}
<script nonce="${nonce}">${bilingue ? BOOT : BOOT_FR_SEUL}</script>
</head>
<body>
${rendreSautContenu(bilingue)}
<div class="wrap${avecTdm ? " avec-tdm" : ""}">
${avecTdm ? rendreSommaire(options.sections!) : ""}
<main id="contenu-principal" tabindex="-1">
${options.corpsHtml}
</main>
</div>
${rendrePastilleHaut(bilingue)}
<script nonce="${nonce}">${JS_COMPACTE}</script>
</body>
</html>`;

  return new Response(html, { status: statut, headers });
}
