export function relativeDate(date: string) {
  if (date.includes('Today') || date.includes('Yesterday')) return date;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
}

