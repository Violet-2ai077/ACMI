export const observerStyles = `
:root{color-scheme:dark;--base:#101725;--panel:#171f2f;--line:#3d4c64;--text:#f4f7fc;--muted:#a9b7cc;--teal:#8ce5d1;--amber:#ffcf85;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--base);color:var(--text);font:1rem/1.55 system-ui,sans-serif}
main{max-width:74rem;margin:auto;padding:clamp(1rem,4vw,3rem)}
header{border-top:2px solid var(--teal);padding-block:1.5rem 2rem}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(2.1rem,5vw,3.5rem);line-height:1.1;letter-spacing:-.045em}
h2{font-size:1.3rem;margin-bottom:.75rem}
h3{font-size:1.1rem;overflow-wrap:anywhere}
code,.eyebrow,.badge{font-family:var(--mono);overflow-wrap:anywhere}
.eyebrow{font-size:.78rem;letter-spacing:.12em;color:var(--teal);text-transform:uppercase;margin-bottom:.75rem}
.caption,.meta{color:var(--muted);overflow-wrap:anywhere}
.caption{margin-top:.7rem;max-width:63ch}
.badge{display:inline-block;border:1px solid currentColor;border-radius:.25rem;padding:.05rem .45rem;color:var(--teal);font-size:.8rem}
.warning{color:var(--amber)}
.summary{border-block:1px solid var(--line);padding:1rem 0 1.25rem;margin-bottom:2rem}
.tasks{padding:0;margin:0;list-style:none}
.tasks li{display:flex;gap:.3rem 1rem;flex-wrap:wrap;align-items:baseline}
.session{margin:1rem 0 1.5rem;padding:1rem;background:var(--panel);border:1px solid var(--line);border-radius:.55rem}
.timeline{padding:0;margin:.75rem 0 0;list-style:none}
.event{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(0,2fr) minmax(0,2fr);gap:.4rem 1rem;padding:.7rem 0;border-top:1px solid var(--line)}
.event p,.meta{font-size:.87rem}
.event strong{overflow-wrap:anywhere}
.event p+p{margin-top:.15rem}
.position{font-family:var(--mono);color:var(--teal);padding-right:.4rem}
footer{padding-top:.6rem;border-top:1px solid var(--line);font-size:.86rem}
@media(max-width:42rem){.event{grid-template-columns:1fr}.event>div+div{padding-left:.85rem;border-left:1px solid var(--line)}}
`
