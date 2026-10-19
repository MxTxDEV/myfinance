/**
 * Camada de eventos da landing. Não depende de nenhum serviço: o evento vai para
 *  1) window.dataLayer (Google Tag Manager/GA4), se existir;
 *  2) window.plausible, se existir;
 *  3) um CustomEvent "fos:analytics" (para qualquer script seu escutar).
 * Nunca envie dados financeiros ou pessoais nas propriedades. Respeita "Não rastrear" do navegador.
 * Eventos: landing_view, cta_primary_click, demo_click, demo_video_play, pricing_view, purchase_cta_click, signup_start.
 * "signup_complete" depende de integração no servidor/pixel (ver docs/LANDING.md).
 */
export type LandingEvent = "landing_view" | "cta_primary_click" | "demo_click" | "demo_video_play" | "pricing_view" | "purchase_cta_click" | "signup_start";
type Props = Record<string, string | number | boolean>;

interface AnalyticsWindow extends Window { dataLayer?: unknown[]; plausible?: (name: string, o?: { props?: Props }) => void }

export function track(event: LandingEvent, props: Props = {}) {
  if (typeof window === "undefined") return;
  if (navigator.doNotTrack === "1") return;
  const w = window as AnalyticsWindow;
  try {
    w.dataLayer?.push({ event, ...props });
    w.plausible?.(event, { props });
    window.dispatchEvent(new CustomEvent("fos:analytics", { detail: { event, ...props } }));
  } catch { /* instrumentação nunca deve quebrar a página */ }
}
