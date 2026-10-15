// GSAP timelines follow the documented gsap.fromTo / timeline patterns.
// Lens geometry is native CSS 3D; animation is decorative and never drives capture timing.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const gsap = window.gsap;
let coverMotion, introMotion, currentScreen = 'cover';
export function enterScreen(element) {
  if (!gsap || reduced.matches) return;
  gsap.fromTo(element, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .42, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
}
export function animateSheet(element) {
  if (!gsap || reduced.matches) return;
  gsap.fromTo(element, { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out', clearProps: 'opacity,transform', overwrite: true });
}
export function pulse(element) {
  if (!gsap || reduced.matches) return;
  gsap.fromTo(element, { scale: .91 }, { scale: 1, duration: .35, ease: 'back.out(1.5)', clearProps: 'transform', overwrite: true });
}
export function motionScreen(screen) { currentScreen = screen; updateMotion(); }
function updateMotion() {
  const active = currentScreen === 'cover' && !document.hidden && !reduced.matches;
  if (active) coverMotion?.resume(); else coverMotion?.pause();
  if (reduced.matches) {
    introMotion?.progress(1);
    gsap?.set('#lens-object', { rotationX: 13, rotationY: -15, rotationZ: -9, y: 0 });
    gsap?.set('.lens-reflection', { x: 0 });
  }
}
export function initializeMotion() {
  if (!gsap) return;
  coverMotion = gsap.timeline({ repeat: -1, yoyo: true, paused: true })
    .fromTo('#lens-object', { rotationX: 13, rotationY: -15, rotationZ: -9, y: 0 }, { rotationX: 5, rotationY: 12, rotationZ: 5, y: -8, duration: 7, ease: 'sine.inOut' }, 0)
    .fromTo('.lens-reflection', { x: -22 }, { x: 30, duration: 7, ease: 'sine.inOut' }, 0);
  if (!reduced.matches) {
    introMotion = gsap.timeline().fromTo('.lens-scene', { opacity: 0, y: 28, scale: .93 }, { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: 'power3.out', clearProps: 'opacity,transform' })
      .fromTo('.cover-copy, .shiny-cta', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .7, stagger: .1, clearProps: 'opacity,transform' }, .35);
  }
  reduced.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  updateMotion();
}
