const { decodeAndVerifyIdToken } = require("../utils");

const routeRoleAccess = {
  '/register': ['admin', 'doctors', 'staff'],
  '/drugs': ['admin', 'pharmacist'],
  '/labtests': ['admin', 'labtech'],
  '/listPatients': ['admin', 'doctors', 'staff'],
  '/getPatientDetails': ['admin', 'doctors', 'staff'],
  '/updatePatient': ['admin', 'doctors', 'staff'],
  '/labtests-patients-list': ['admin', 'doctors', 'technician', 'staff'],
  '/patient-labtests': ['admin', 'doctors', 'staff'],
  '/labtest-results': ['admin', 'doctors', 'technician', 'staff'],
  '/patient-confirmLabtests': ['admin', 'doctors', 'staff'],
  '/update-patient-labtests': ['admin', 'doctors', 'staff'],
  '/prescriptions': ['admin', 'doctors'],
  '/prescriptions/{prescriptionId}': ['admin', 'doctors'],
  '/deleteReviewObservation': ['admin', 'doctors'],
  '/dashboard': ['admin', 'doctors', 'staff'],
  // Add more paths and their allowed roles here
};

module.exports.handler = async (event) => {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
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

    const requestPath = event.rawPath || event.path || ''; // /prescriptions/f0913ee6...

    // --- Enhanced path matching ---
    // 1. Exact match first
    let matchedRoles = routeRoleAccess[requestPath];

    // 2. Try dynamic path match if no exact match
    if (!matchedRoles) {
      const matchedKey = Object.keys(routeRoleAccess).find((pattern) => {
        // convert /prescriptions/{prescriptionId} -> ^/prescriptions/[^/]+$
        const regex = new RegExp('^' + pattern.replace(/\{[^/]+\}/g, '[^/]+') + '$');
        return regex.test(requestPath);
      });
      matchedRoles = matchedKey ? routeRoleAccess[matchedKey] : [];
    }

    const effect = matchedRoles.includes(userRole) ? 'Allow' : 'Deny';

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
        username: decoded['cognito:username'],
      },
    };
  } catch (err) {
    console.error('Auth error:', err);
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
