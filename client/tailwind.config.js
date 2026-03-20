/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors
        'dark': {
          '900': '#121212',
          '800': '#1e1e1e',
          '700': '#2d2d2d',
          '600': '#383838',
        },
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            code: {
              color: theme('colors.blue.400'),
              backgroundColor: theme('colors.gray.800'),
              borderRadius: theme('borderRadius.md'),
              paddingLeft: theme('spacing.1'),
              paddingRight: theme('spacing.1'),
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              color: theme('colors.gray.200'),
              backgroundColor: theme('colors.gray.800'),
            },
          },
        },
        invert: {
          css: {
            color: theme('colors.gray.200'),
            a: {
              color: theme('colors.blue.400'),
            },
            h1: {
              color: theme('colors.white'),
            },
            h2: {
              color: theme('colors.white'),
            },
            h3: {
              color: theme('colors.white'),
            },
            h4: {
              color: theme('colors.white'),
            },
            strong: {
              color: theme('colors.white'),
            },
            code: {
              color: theme('colors.blue.400'),
              backgroundColor: theme('colors.gray.800'),
            },
            pre: {
              color: theme('colors.gray.200'),
              backgroundColor: theme('colors.gray.800'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
  darkMode: 'class',
}; 