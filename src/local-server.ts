import * as express from 'express';
import { handle } from './lambda/view-test-results';
const app = express();

app.use('/', async (req, res) => {
    const h: any = handle;
    const result = await h({ queryStringParameters: { testId: '938797'} }, {}, () => ({}));
    res.send(result.body);
});

const server = app.listen(5000, () => {
    console.log({ server: server.address() });
});
