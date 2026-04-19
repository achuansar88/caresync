module.exports = {
  success: (data, statusCode = 200) => {
    return {
      statusCode,
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  },
  error: (error, statusCode = 500) => {
    return {
      statusCode,
      body: JSON.stringify({
        error: error.message || 'Something went wrong'
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};