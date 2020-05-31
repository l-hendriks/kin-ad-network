/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fetch from 'node-fetch';
import moment from 'moment-es6';
import {
    IronSourceReport, IronSourceReportAppData,
} from '../constants';

const IRONSOURCE_AUTH_URL = 'https://platform.ironsrc.com/partners/publisher/auth';
const IRONSOURCE_REPORTING_URL = 'https://platform.ironsrc.com/partners/publisher/mediation/applications/v6/stats';

const AD_NETWORKS = ['ironSource', 'AdMob'];
const AD_NETWORK_INTERAL = ['IRONSOURCE', 'ADMOB_VIA_IS'];

const getBearerToken = async (): Promise<string> => {
    const res = await fetch(
        `${IRONSOURCE_AUTH_URL}`,
        {
            headers: {
                secretkey: process.env.IRONSOURCE_SECRET_KEY!,
                refreshToken: process.env.IRONSOURCE_REFRESH_TOKEN!,
            },
        },
    );
    return res.json();
};

const getYesterdayReport = async (
    startDate: string,
    endDate: string,
    bearerToken: string,
    adSource: string,
): Promise<IronSourceReport[]> => {
    const res = await fetch(
        `${IRONSOURCE_REPORTING_URL}?startDate=${startDate}&endDate=${endDate}&breakdown=app&adSource=${adSource}`,
        {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
            },
        },
    );
    return res.json();
};

const reporting = async (date: moment.Moment) => {
    const startDate = moment(date).subtract(1, 'day').startOf('day').format('YYYY-MM-DD');
    const endDate = moment(date).subtract(1, 'day').endOf('day').format('YYYY-MM-DD');

    const bearerToken = await getBearerToken();
    const reportsByAdNetwork = await Promise.all(
        AD_NETWORKS.map(
            (adSource) => getYesterdayReport(startDate, endDate, bearerToken, adSource),
        ),
    );

    const information: Record<string, Record<string, IronSourceReportAppData>> = {};
    for (let i = 0; i < AD_NETWORKS.length; i += 1) {
        // Add eCPM to save averages in database
        reportsByAdNetwork[i].forEach(({ appKey, data }) => {
            if (!information[appKey]) {
                information[appKey] = {};
            }
            // eslint-disable-next-line prefer-destructuring
            information[appKey][AD_NETWORK_INTERAL[i]] = data[0];
        });
    }

    return information;
};

export default reporting;
