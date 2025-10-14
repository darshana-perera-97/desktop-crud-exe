# Sinhala Font Setup Instructions

This application uses custom Sinhala fonts to properly display Sinhala text in form labels and inputs.

## Required Fonts

The application is configured to use the following fonts in order of preference:

1. **FM Malithi** - Primary Sinhala font
2. **Malithi Web** - Web-optimized Sinhala font
3. **Iskoola Pota** - Alternative Sinhala font
4. **Noto Sans Sinhala** - Google Fonts fallback

## Font Installation

### Option 1: Download Fonts to Local Directory

1. Download the following font files and place them in the `fonts/` directory:
   - `FM-Malithi.ttf` (or `.woff`, `.woff2`)
   - `MalithiWeb.ttf` (or `.woff`, `.woff2`)
   - `IskoolaPota.ttf` (or `.woff`, `.woff2`)

2. The CSS is already configured to load these fonts from the `fonts/` directory.

### Option 2: Install Fonts System-Wide

1. Download the font files from:
   - [FM Malithi](https://www.fonts.lk/fonts/fm-malithi/)
   - [Malithi Web](https://www.fonts.lk/fonts/malithi-web/)
   - [Iskoola Pota](https://www.fonts.lk/fonts/iskoola-pota/)

2. Install the fonts on your Windows system:
   - Right-click on each `.ttf` file
   - Select "Install" or "Install for all users"

### Option 3: Use Google Fonts (Fallback)

The application already includes Google Fonts' "Noto Sans Sinhala" as a fallback, which will work without any additional setup.

## Font Sources

- **FM Malithi**: Available from [fonts.lk](https://www.fonts.lk/)
- **Malithi Web**: Available from [fonts.lk](https://www.fonts.lk/)
- **Iskoola Pota**: Available from [fonts.lk](https://www.fonts.lk/)
- **Noto Sans Sinhala**: Available from [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+Sinhala)

## Testing Font Display

After installing fonts, test the application by:

1. Running the app: `npm start`
2. Check that Sinhala text in form labels displays correctly
3. Verify that Sinhala text can be typed in input fields
4. Test the dropdown options with Sinhala text

## Troubleshooting

If Sinhala text doesn't display correctly:

1. Check that fonts are properly installed
2. Clear browser cache and restart the app
3. Verify the font files are in the correct `fonts/` directory
4. Check browser developer tools for font loading errors

## Font Features

The configured fonts support:
- Full Sinhala Unicode range
- Proper character rendering
- Good readability at various sizes
- Consistent display across different browsers
