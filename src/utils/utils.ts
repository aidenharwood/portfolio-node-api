export function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = date.toLocaleDateString(undefined, { weekday: "long" });
  const dayNum = date.getDate();
  const ordinal =
    dayNum === 1 ? "st" : dayNum === 2 ? "nd" : dayNum === 3 ? "rd" : "th";
  const month = date.toLocaleDateString(undefined, { month: "long" });
  const year = date.getFullYear();
  return `${day} ${dayNum}${ordinal} ${month} ${year}`;
}
