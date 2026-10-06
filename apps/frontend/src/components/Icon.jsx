const paths = {
  chat: "M4 5h16v11H9l-5 4V5z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-14a4 4 0 0 1 0 8m6 6v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  profile: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  send: "m22 2-7 20-4-9-9-4 20-7zM22 2 11 13",
  arrow: "m15 18-6-6 6-6",
  logout: "M9 5H4v14h5m5-14 7 7-7 7m-5-7h12",
  star: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z",
};
export default function Icon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.chat} />
    </svg>
  );
}
