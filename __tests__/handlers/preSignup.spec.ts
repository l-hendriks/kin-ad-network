import preSignup from '../../handlers/preSignup';

describe('preSignup', () => {
    it('should return autoverified', async () => {
        const result = await preSignup({ response: { testResponseKey: 'test' }, testKey: 'testVal' });
        expect(result).toEqual({
            response: {
                autoConfirmUser: true,
                autoVerifyEmail: true,
                testResponseKey: 'test',
            },
            testKey: 'testVal',
        });
        expect.assertions(1);
    });
});
