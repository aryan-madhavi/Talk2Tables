import { cn } from '../../../lib/utils';

/**
 * Returns Tailwind class string for a standard text input.
 * Pass `hasError = true` to switch to the error visual state.
 */
export function inputCls(hasError: boolean): string {
  return cn(
    'w-full px-3 py-2 rounded-lg border text-sm transition-all outline-none',
    'placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500',
    hasError
      ? 'border-red-300 bg-red-50 focus:ring-red-500/20 focus:border-red-400'
      : 'border-gray-200 bg-white hover:border-gray-300',
  );
}