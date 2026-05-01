import { delay, http, HttpResponse } from 'msw';

export const exampleApiUrl = 'http://localhost/api/example-items';

export const handlers = [
  http.get(exampleApiUrl, async () => {
    await delay(25);

    return HttpResponse.json({
      items: ['Plan board updates', 'Review column limits']
    });
  })
];