/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tell Tailwind which files to scan for class names
  // It only includes classes it finds here in the final bundle (tree-shaking)
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // We'll add our custom colors here later (area-of-life colors, etc.)
    },
  },
  plugins: [],
};
