const { dynamodb } = require('../utils/db');
const { success, error } = require('../utils/responses');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;
const TABLE_PATIENTS = process.env.PATIENTS_TABLE || `${process.env.stage}Patients`;
const TABLE_PATIENT_LABTESTS = process.env.PATIENT_LABTESTS_TABLE || `${process.env.stage}PatientLabTests`;
const IST_OFFSET_MINUTES = 330;
const TIMEZONE = 'Asia/Kolkata';

const scanAllItems = async (params) => {
  const items = [];
  let lastEvaluatedKey;

  do {
    const result = await dynamodb.scan({
      ...params,
      ExclusiveStartKey: lastEvaluatedKey
    }).promise();

    if (Array.isArray(result.Items)) {
      items.push(...result.Items);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds

const parseStoredDate = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Date-only format: YYYY-MM-DD (e.g., 2026-04-15) - treat as IST day start
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    // Create a date at midnight IST (00:00 IST = 18:30 previous day UTC)
    return new Date(Date.UTC(year, month - 1, day, 18, 30, 0));
  }
  
  // DateTime format YYYY-MM-DDTHH:mm:ss - this is formatDate() output, stored in IST
  // We need to parse it as IST time and convert to UTC for comparison
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match.map(Number);
      // Create date treating the components as IST
      const istDate = new Date(year, month - 1, day, hour, minute, second);
      // Convert IST to UTC by subtracting the offset
      return new Date(istDate.getTime() - IST_OFFSET_MS);
    }
  }

  // Format with explicit timezone: use as-is
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getNowInIst = () => {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
};

const getUtcDateFromIstParts = (year, month, day) =>
  new Date(Date.UTC(year, month - 1, day, 0, -IST_OFFSET_MINUTES, 0, 0));

const getPeriodRanges = () => {
  const nowIst = getNowInIst();
  const year = nowIst.getUTCFullYear();
  const month = nowIst.getUTCMonth() + 1;
  const day = nowIst.getUTCDate();

  const dailyStart = getUtcDateFromIstParts(year, month, day);
  const dailyEnd = new Date(dailyStart.getTime() + 24 * 60 * 60 * 1000);

  const dayOfWeek = nowIst.getUTCDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  const weeklyStart = new Date(dailyStart.getTime() - (isoDay - 1) * 24 * 60 * 60 * 1000);
  const weeklyEnd = new Date(weeklyStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const monthlyStart = getUtcDateFromIstParts(year, month, 1);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthlyEnd = getUtcDateFromIstParts(nextMonthYear, nextMonth, 1);

  return {
    daily: { start: dailyStart, end: dailyEnd },
    weekly: { start: weeklyStart, end: weeklyEnd },
    monthly: { start: monthlyStart, end: monthlyEnd }
  };
};

const isInRange = (date, range) => !!date && date >= range.start && date < range.end;

const createPeriodStats = (range) => ({
  dateRange: {
    start: range.start.toISOString(),
    end: range.end.toISOString()
  },
  revenue: 0,
  cashRevenue: 0,
  onlineRevenue: 0,
  cardRevenue: 0,
  patientVisits: 0,
  numberOfPatients: 0,
  newPatients: 0,
  _patientIds: new Set()
});

const createLabStats = (range) => ({
  dateRange: {
    start: range.start.toISOString(),
    end: range.end.toISOString()
  },
  revenue: 0,
  patientsCount: 0,
  testsCount: 0,
  _patientIds: new Set()
});

module.exports.handler = async () => {
  try {
    const [invoices, patients, labTests] = await Promise.all([
      scanAllItems({
        TableName: TABLE_INVOICE,
        ProjectionExpression: 'invoiceId, patientId, totalAmount, paidAmount, cashPaymentAmount, onlinePaymentAmount, cardPaymentAmount, createdDateTime'
      }),
      scanAllItems({
        TableName: TABLE_PATIENTS,
        ProjectionExpression: 'patientId, createdDateTime, lastVisits'
      }),
      scanAllItems({
        TableName: TABLE_PATIENT_LABTESTS,
        ProjectionExpression: 'patientLabTestsId, patientId, totalAmount, paidRate, #dt, tests',
        ExpressionAttributeNames: {
          '#dt': 'dateTime'
        }
      })
    ]);

    const ranges = getPeriodRanges();
    const stats = {
      daily: createPeriodStats(ranges.daily),
      weekly: createPeriodStats(ranges.weekly),
      monthly: createPeriodStats(ranges.monthly)
    };

    const labStats = {
      daily: createLabStats(ranges.daily),
      weekly: createLabStats(ranges.weekly),
      monthly: createLabStats(ranges.monthly)
    };

    // Total patients count
    const totalPatients = patients.length;

    // Process invoices for revenue and payment methods
    for (const invoice of invoices) {
      const createdDate = parseStoredDate(invoice.createdDateTime);
      if (!createdDate) {
        continue;
      }

      const totalAmount = Number(invoice.totalAmount) || 0;
      const cashPayment = Number(invoice.cashPaymentAmount) || 0;
      const onlinePayment = Number(invoice.onlinePaymentAmount) || 0;
      const cardPayment = Number(invoice.cardPaymentAmount) || 0;

      for (const [period, range] of Object.entries(ranges)) {
        if (isInRange(createdDate, range)) {
          stats[period].revenue += totalAmount;
          stats[period].cashRevenue += cashPayment;
          stats[period].onlineRevenue += onlinePayment;
          stats[period].cardRevenue += cardPayment;
        }
      }
    }

    // Process patients for visits and new patients
    for (const patient of patients) {
      const patientId = patient.patientId;
      const createdDate = parseStoredDate(patient.createdDateTime);
      const lastVisits = Array.isArray(patient.lastVisits) ? patient.lastVisits : [];

      for (const [period, range] of Object.entries(ranges)) {
        if (isInRange(createdDate, range)) {
          stats[period].newPatients += 1;
        }
      }

      for (const visit of lastVisits) {
        const visitDate = parseStoredDate(visit?.visitDateTime);
        if (!visitDate) {
          continue;
        }

        for (const [period, range] of Object.entries(ranges)) {
          if (isInRange(visitDate, range)) {
            stats[period].patientVisits += 1;
            if (patientId !== undefined && patientId !== null) {
              stats[period]._patientIds.add(String(patientId));
            }
          }
        }
      }
    }

    // Process lab tests for revenue and patient counts
    for (const labTest of labTests) {
      const testDate = parseStoredDate(labTest.dateTime);
      if (!testDate) {
        continue;
      }

      const paidAmount = Number(labTest.paidRate) || 0;
      const testsCount = Array.isArray(labTest.tests) ? labTest.tests.length : 0;

      for (const [period, range] of Object.entries(ranges)) {
        if (isInRange(testDate, range)) {
          labStats[period].revenue += paidAmount;
          labStats[period].testsCount += testsCount;
          if (labTest.patientId) {
            labStats[period]._patientIds.add(String(labTest.patientId));
          }
        }
      }
    }

    // Finalize stats
    for (const period of Object.keys(stats)) {
      stats[period].numberOfPatients = stats[period]._patientIds.size;
      delete stats[period]._patientIds;
    }

    for (const period of Object.keys(labStats)) {
      labStats[period].patientsCount = labStats[period]._patientIds.size;
      delete labStats[period]._patientIds;
    }

    return success({
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
      daily: stats.daily,
      weekly: stats.weekly,
      monthly: stats.monthly,
      lab: {
        daily: labStats.daily,
        weekly: labStats.weekly,
        monthly: labStats.monthly
      },
      totalPatients: totalPatients
    });
  } catch (err) {
    console.error('Error in getDashboardStats:', err);
    return error(err);
  }
};
