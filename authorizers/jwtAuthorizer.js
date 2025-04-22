const { decodeAndVerifyIdToken } = require("../utils");

const routeRoleAccess = {
  '/register': ['admin','doctors'],
  '/drugs': ['admin', 'pharmacist'],
  '/labtests': ['admin', 'labtech'],
  '/listPatients':['admin', 'doctors'],
  '/getPatientDetails':['admin', 'doctors'],
  '/updatePatient':['admin', 'doctors']
  // Add more paths and their allowed roles here
};

module.exports.handler = async (event) => {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  console.log(event.rawPath)
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      principalId: 'Unauthorized',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: event.routeArn,
          },
        ],
      },
    };
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await decodeAndVerifyIdToken(token);
    const userRole = decoded['cognito:groups']?.[0]?.toLowerCase(); // e.g., 'doctors'

    const requestPath = event.rawPath || event.path || ''; // For offline & live compatibility
    const allowedRoles = routeRoleAccess[requestPath] || [];
    
    const effect = allowedRoles.includes(userRole) ? 'Allow' : 'Deny';
    return {
      principalId: decoded.sub || 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: effect,
            Resource: event.routeArn,
          },
        ],
      },
      context: {
        role: userRole,
        email: decoded.email,
        username: decoded['cognito:username'],
      },
    };
  } catch (err) {
    console.error('Auth error:*************', err);
    return {
      principalId: 'Unauthorized',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: event.routeArn,
          },
        ],
      },
    };
  }
};
