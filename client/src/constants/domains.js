// Single source of truth for domain options — used by the Register page
// (student sign-up) and the Admin quiz builder (assigning a quiz to a domain).
// Keeping these in one place means a student's domain and a quiz's domain
// are always drawn from the exact same list, so matching them up works reliably.
export const DOMAINS = [
  "Frontend Development",
  "Backend Development",
  "Full Stack Development",
  "Mobile App Development",
  "Data Science",
  "DevOps",
  "UI/UX Design",
  "Quality Assurance",
];