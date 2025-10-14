# Desktop CRUD App

A simple, clean desktop application built with JavaScript and Electron for Windows PCs.

## Features

- 🖥️ **Windows Compatible**: Built with Electron for seamless desktop experience
- 🎨 **Clean Design**: Minimalistic whitish theme with black and white color scheme
- 📝 **Text Display**: Simple interface for displaying text content
- 🔄 **Interactive Elements**: Buttons for showing messages, updating time, and theme switching
- 📱 **Responsive**: Adapts to different window sizes

## Prerequisites

Before running this application, make sure you have:

- **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

## Installation

1. **Clone or download** this project to your local machine
2. **Open Command Prompt or PowerShell** in the project directory
3. **Install dependencies**:
   ```bash
   npm install
   ```

## Running the Application

### Development Mode
To run the app in development mode (with developer tools):
```bash
npm run dev
```

### Production Mode
To run the app normally:
```bash
npm start
```

## Building for Distribution

To create a distributable Windows executable:

```bash
npm run build
```

This will create a `dist` folder containing the Windows installer and executable files.

## Project Structure

```
desktop-crud-exe/
├── main.js          # Main Electron process
├── index.html       # Application UI
├── styles.css       # Styling and themes
├── renderer.js      # Frontend JavaScript
├── package.json     # Project configuration
└── README.md        # This file
```

## Customization

### Adding Your Own Content
- Edit `index.html` to change the displayed text and structure
- Modify `styles.css` to adjust colors, fonts, and layout
- Update `renderer.js` to add new interactive features

### Changing the Theme
The app includes a built-in dark/light theme toggle. You can customize the colors in `styles.css`:
- Light theme colors are defined in the main CSS rules
- Dark theme colors are defined in `.dark-theme` selectors

### Adding New Features
1. Add HTML elements in `index.html`
2. Style them in `styles.css`
3. Add functionality in `renderer.js`

## Troubleshooting

### Common Issues

**App won't start:**
- Make sure Node.js is installed: `node --version`
- Try deleting `node_modules` folder and running `npm install` again

**Build fails:**
- Ensure you have all dependencies installed
- Check that you're running the command from the project root directory

**App looks different than expected:**
- Clear your browser cache if you're testing in development mode
- Check the console for any JavaScript errors (press F12)

## Technical Details

- **Framework**: Electron 27.x
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Build Tool**: electron-builder
- **Platform**: Windows (cross-platform compatible)

## License

MIT License - feel free to modify and distribute as needed.

## Support

If you encounter any issues or have questions, please check the troubleshooting section above or refer to the [Electron documentation](https://www.electronjs.org/docs).
