import 'dotenv/config';
import { checkIcaAppointment } from './ica-check.mjs';

const result = await checkIcaAppointment();
console.log(JSON.stringify(result, null, 2));

if (result.status === 'blocked' || result.status === 'error' || result.status === 'not_configured') {
  process.exitCode = 1;
}
