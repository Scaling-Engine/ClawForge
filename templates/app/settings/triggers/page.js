import { redirect } from 'next/navigation';

export default function SettingsTriggersRedirect() {
  redirect('/admin/triggers');
}
