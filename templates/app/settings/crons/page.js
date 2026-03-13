import { redirect } from 'next/navigation';

export default function SettingsCronsRedirect() {
  redirect('/admin/crons');
}
