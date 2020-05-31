/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fetch from 'node-fetch';

import { LambdaResponse } from '../constants';

interface Event {
    headers: {
        'x-api-key': string;
    };
    body: string;
}

interface EventBody {
    entries: Record<string, number>;
    memo: string;
}

const sendKin = async (entry: [string, number], memo: string) => {
    const wallet = entry[0];
    const amount = entry[1];

    const rawRes = await fetch(`http://${process.env.KIN_SERVER!}/pay`, {
        method: 'POST',
        body: JSON.stringify({
            destination: wallet,
            amount,
            memo,
        }),
    });
    const res = await rawRes.json();

    return { wallet, amount, tx: res.tx_id };
};

const returnMessage = (data: unknown): LambdaResponse => ({
    statusCode: 200,
    body: JSON.stringify(data),
});

const payout = async (event: Event): Promise<LambdaResponse> => {
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.KIN_PAYOUT_SECRET!) {
        return returnMessage({ error: 'incorrect secret' });
    }

    const { entries, memo }: EventBody = JSON.parse(event.body);
    if (!memo || !entries) {
        return returnMessage({ error: 'no memo or entries' });
    }
    const transactions = await Promise.all(
        Object.entries(entries).map((entry) => sendKin(entry, memo)),
    );

    return returnMessage(transactions);
};

export default payout;
