const fn = async (event: string) => {
  return {
    statusCode: 200,
    body: `Go Serverless v1.0! Your function executed successfully ${process.env.TESTKEY}!`,
  };
};

export default fn;
