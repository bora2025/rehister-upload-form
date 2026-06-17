// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    console.log('Mini App loaded successfully!');

    // Get elements
    const actionBtn = document.getElementById('actionBtn');
    const output = document.getElementById('output');
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    const header = document.querySelector('header');
    const body = document.body;
    const html = document.documentElement;

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    // Hamburger menu toggle
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = hamburger.classList.contains('active');
            
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
            overlay.classList.toggle('active');
            
            // Toggle scroll lock
            if (!isActive) {
                // Menu opening - lock scroll
                body.classList.add('menu-open');
                html.classList.add('menu-open');
                body.style.top = `-${window.scrollY}px`;
                body.style.position = 'fixed';
                body.style.width = '100%';
            } else {
                // Menu closing - unlock scroll
                body.classList.remove('menu-open');
                html.classList.remove('menu-open');
                const scrollY = body.style.top;
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        });

        // Close menu when clicking overlay
        overlay.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
            overlay.classList.remove('active');
            body.classList.remove('menu-open');
            html.classList.remove('menu-open');
            body.style.position = '';
            body.style.top = '';
            body.style.width = '';
        });

        // Close menu when clicking nav links
        const navLinks = navMenu.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
                overlay.classList.remove('active');
                body.classList.remove('menu-open');
                html.classList.remove('menu-open');
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
            });
        });

        // Close menu when pressing Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
                overlay.classList.remove('active');
                body.classList.remove('menu-open');
                html.classList.remove('menu-open');
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
            }
        });

        // Prevent scroll on header
        header.addEventListener('touchmove', (e) => {
            if (navMenu.classList.contains('active')) {
                e.preventDefault();
            }
        }, { passive: false });

        // Handle window resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (window.innerWidth > 768) {
                    // Reset on desktop
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                    overlay.classList.remove('active');
                    body.classList.remove('menu-open');
                    html.classList.remove('menu-open');
                    body.style.position = '';
                    body.style.top = '';
                    body.style.width = '';
                }
            }, 250);
        });
    }

    // Slider functionality
    const slider = document.querySelector('.slider');
    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.querySelector('.slider-btn.prev');
    const nextBtn = document.querySelector('.slider-btn.next');
    const dots = document.querySelectorAll('.dot');
    let currentSlide = 0;
    let slideInterval;

    function showSlide(index) {
        // Remove active class from all slides and dots
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));

        // Add active class to current slide and dot
        slides[index].classList.add('active');
        dots[index].classList.add('active');

        currentSlide = index;
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }

    function prevSlide() {
        currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        showSlide(currentSlide);
    }

    function startAutoSlide() {
        slideInterval = setInterval(nextSlide, 5000); // Change slide every 5 seconds
    }

    function stopAutoSlide() {
        clearInterval(slideInterval);
    }

    // Event listeners for slider controls
    if (prevBtn && nextBtn && dots.length > 0) {
        prevBtn.addEventListener('click', () => {
            prevSlide();
            stopAutoSlide();
            startAutoSlide(); // Restart auto-slide after manual interaction
        });

        nextBtn.addEventListener('click', () => {
            nextSlide();
            stopAutoSlide();
            startAutoSlide();
        });

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                showSlide(index);
                stopAutoSlide();
                startAutoSlide();
            });
        });

        // Pause auto-slide on hover
        slider.addEventListener('mouseenter', stopAutoSlide);
        slider.addEventListener('mouseleave', startAutoSlide);

        // Start auto-slide initially
        startAutoSlide();
    }

    // Button click handler
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            handleButtonClick();
        });
    }

    // Main function
    function handleButtonClick() {
        const messages = [
            'Hello! Welcome to the Mini App! 👋',
            'Great job! You clicked the button! 🎉',
            'This app is working perfectly! ✨',
            'Keep exploring and building! 🚀',
            'You\'re doing amazing! 💪'
        ];

        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        output.textContent = randomMessage;
        output.classList.add('show');

        // Add some animation
        actionBtn.textContent = 'Click Again!';
        
        setTimeout(() => {
            output.classList.remove('show');
        }, 3000);
    }

    // Additional functionality can be added here
    initializeApp();
});

// Initialize app
function initializeApp() {
    console.log('App initialized at:', new Date().toLocaleString());
    
    // Add any initialization logic here
    setupEventListeners();
}

// Setup additional event listeners
function setupEventListeners() {
    // Example: Log when user scrolls
    window.addEventListener('scroll', () => {
        // Add scroll-based functionality here
    });

    // Example: Handle window resize
    window.addEventListener('resize', () => {
        console.log('Window resized to:', window.innerWidth, 'x', window.innerHeight);
    });

    // Handle contact form submission (only if no custom handler is already bound)
    const contactForm = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');

    if (contactForm && !contactForm.dataset.customSubmitBound && !contactForm.dataset.listenerAdded && !contactForm.dataset.registerForm) {
        contactForm.dataset.listenerAdded = 'true';
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(contactForm);
            const data = {
                type: formData.get('type') || '',
                name: formData.get('name'),
                gender: formData.get('gender') || '',
                organization: formData.get('organization') || '',
                phone: formData.get('phone') || '',
                email: formData.get('email'),
                message: formData.get('message') || ''
            };

            // Show loading state
            formStatus.textContent = 'Submitting...';
            formStatus.className = 'form-status loading';

            try {
                // Replace with your Google Apps Script Web App URL
                const scriptUrl = 'https://script.google.com/macros/s/AKfycbzq_hIcJw9k5ajcGdESb82Lh7KkGK0S_urz-QSOOlk42hyAqrlFYRBR-H7Hvi6uvO5Q/exec';
                
                console.log('Submitting form data:', data);
                
                const response = await fetch(scriptUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                if (result && result.status === 'duplicate') {
                    formStatus.textContent = 'អ៊ីមែលនេះបានចុះឈ្មោះរួចហើយ / This email is already registered.';
                    formStatus.className = 'form-status error';
                    return;
                }
                if (!result || result.status !== 'success') {
                    throw new Error(result?.message || 'Submission failed');
                }

                console.log('Form submitted successfully');
                
                formStatus.textContent = 'Thank you! Your submission has been received. Redirecting to home...';
                formStatus.className = 'form-status success';
                contactForm.reset();

                // Redirect to home page after 2 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);

            } catch (error) {
                console.error('Form submission error:', error);
                formStatus.textContent = 'An error occurred. Please try again.';
                formStatus.className = 'form-status error';
            }

            // Clear status after 5 seconds
            setTimeout(() => {
                formStatus.textContent = '';
                formStatus.className = 'form-status';
            }, 5000);
        });
    }
}

// Fix for iOS Safari 100vh issue
    function setVH() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);

// Utility functions
const utils = {
    // Format date
    formatDate: (date) => {
        return new Date(date).toLocaleDateString();
    },

    // Generate random color
    randomColor: () => {
        return '#' + Math.floor(Math.random()*16777215).toString(16);
    },

    // Capitalize string
    capitalize: (str) => {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { utils };
}
