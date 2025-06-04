// Language switching functionality
let currentLang = 'ja';

function toggleLanguage() {
    currentLang = currentLang === 'ja' ? 'en' : 'ja';
    updateLanguage();
}

function updateLanguage() {
    const body = document.body;
    const langButton = document.querySelector('.lang-switch');
    
    if (currentLang === 'en') {
        body.classList.add('lang-en');
        body.classList.remove('lang-ja');
        langButton.textContent = 'JP';
        document.documentElement.lang = 'en';
        
        // Update page title
        document.title = 'Anicca - AI Agent that Watches, Guides & Transforms';
    } else {
        body.classList.add('lang-ja');
        body.classList.remove('lang-en');
        langButton.textContent = 'EN';
        document.documentElement.lang = 'ja';
        
        // Update page title
        document.title = 'Anicca - あなたを見守り、導くAIエージェント';
    }
    
    // Update all elements with data-ja and data-en attributes
    const elements = document.querySelectorAll('[data-ja][data-en]');
    
    elements.forEach((element) => {
        const dataValue = element.getAttribute(`data-${currentLang}`);
        if (dataValue) {
            element.innerHTML = dataValue;
        }
    });
}

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetSection.offsetTop - navHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Initialize language based on browser settings
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('en')) {
        currentLang = 'en';
        updateLanguage();
    }
});

// Add scroll effect to navbar
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    } else {
        navbar.style.boxShadow = 'none';
    }
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Apply animations to feature cards and steps
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.feature-card, .step, .privacy-item');
    
    animatedElements.forEach((element, index) => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        element.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(element);
    });
});