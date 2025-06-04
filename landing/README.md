# Anicca Landing Page

This is the landing page for Anicca, a privacy-first AI screen analysis desktop application.

## Features

- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Bilingual Support**: Full support for Japanese and English languages with easy switching
- **Modern UI**: Clean, gradient-based design with smooth animations
- **Performance Optimized**: Fast loading with minimal dependencies

## Structure

```
landing/
├── index.html      # Main HTML file
├── styles.css      # CSS styles
├── script.js       # JavaScript for interactions
├── logo.svg        # Animated SVG logo
└── README.md       # This file
```

## Key Sections

1. **Hero Section**: Eye-catching introduction with app preview
2. **Features**: Six key features with icons and descriptions
3. **Privacy**: Emphasis on local processing and data security
4. **How It Works**: Simple 3-step guide
5. **Technical Specs**: Requirements and specifications
6. **Download**: Clear call-to-action with download links

## Language Support

The page automatically detects the user's browser language and displays content accordingly. Users can manually switch between Japanese and English using the language toggle button in the navigation.

## Deployment

This landing page can be deployed to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3
- Or served locally

## Customization

To update content:
- Edit text in `index.html` (both `data-ja` and `data-en` attributes)
- Modify colors and styles in `styles.css` (CSS variables in `:root`)
- Adjust animations and interactions in `script.js`

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)  
- Safari 12+
- Mobile browsers (iOS Safari, Chrome Mobile)