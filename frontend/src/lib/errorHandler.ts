import { toast } from 'sonner';

/**
 * Global API error signal handler.
 * Specifically alerts for:
 *   413: Payload Too Large
 *   429: Too Many Requests
 *
 * @param response The Fetch API Response object
 */
export async function handleApiErrorSignal(response: Response) {
  if (response.status === 413) {
    toast.error('Payload Too Large', {
      description: 'The request body is too large for the server to process.',
    });
  } else if (response.status === 429) {
    toast.error('Too Many Requests', {
      description: 'You have sent too many requests in a short period. Please try again later.',
    });
  }
}
