/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export default async ({ response, ...event }: any) => ({
    ...event,
    response: { ...response, autoConfirmUser: true, autoVerifyEmail: true },
});
