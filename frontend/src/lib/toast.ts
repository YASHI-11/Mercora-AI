export type ToastMessage = { id: number; text: string; tone: 'success' | 'error' }

export const TOAST_EVENT = 'mercora:toast'
let counter = 0

/** Fire-and-forget notification, rendered and announced to screen readers by
 * <ToastRegion> (spec §12.2: "screen-reader-friendly cart updates"). */
export function toast(text: string, tone: ToastMessage['tone'] = 'success') {
  window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, { detail: { id: ++counter, text, tone } }))
}
