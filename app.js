document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       0. INITIALIZE ANIMATIONS
       ========================================= */
    if (typeof AOS !== 'undefined') {
        AOS.init({
            once: true,
            offset: 50,
            duration: 800, // Slightly slower, more professional fade
        });
    }

    /* =========================================
       1. NAVBAR SCROLL EFFECT
       ========================================= */
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    /* =========================================
       2. INTERACTIVE CAROUSEL (AUTO + MANUAL)
       ========================================= */
    const track = document.getElementById('carouselTrack');
    const dots = document.querySelectorAll('.dot');
    
    if (track) {
        let currentSlide = 0;
        const totalSlides = 3;
        let slideInterval;

        const moveSlide = (index) => {
            currentSlide = index;
            const translation = -(currentSlide * (100 / totalSlides));
            track.style.transform = `translateX(${translation}%)`;
            
            // Update active dot
            dots.forEach(dot => dot.classList.remove('active'));
            if (dots[currentSlide]) dots[currentSlide].classList.add('active');
        };

        const startCarousel = () => {
            slideInterval = setInterval(() => {
                let next = (currentSlide + 1) % totalSlides;
                moveSlide(next);
            }, 6000); // 6 seconds gives users time to read the detailed text
        };

        startCarousel();

        // Allow users to click dots to change slides interactively
        if (dots.length > 0) {
            dots.forEach(dot => {
                dot.addEventListener('click', (e) => {
                    clearInterval(slideInterval); // Pause auto-scroll when user interacts
                    moveSlide(parseInt(e.target.dataset.index));
                    startCarousel(); // Restart auto-scroll
                });
            });
        }
    }

    /* =========================================
       3. INTERACTIVE CONTENT TABS
       ========================================= */
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-target');
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');
            });
        });
    }

    /* =========================================
       4. CUSTOM TOAST ENGINE (STRICT NO POP-UPS)
       ========================================= */
    const showToast = (message, type = 'success') => {
        let container = document.getElementById('toast-container');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? '🔒' : '⚠️';
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        
        container.appendChild(toast);

        // Trigger CSS transition
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove securely after 3.5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400); 
        }, 3500);
    };

    /* =========================================
       5. AUTHENTICATION MODAL & STATE LOGIC
       ========================================= */
    const GAS_URL = "https://script.google.com/macros/s/AKfycbxuWWpyqSNzr631wjPWdKX-V6WP24qtIwZ1P5IEdgMJ75gZYrfb-PPAJTr5rPSz_oQ/exec"; 

    const authModal = document.getElementById('authModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    // Views
    const registerView = document.getElementById('registerView');
    const loginView = document.getElementById('loginView');
    
    // Forms & Buttons
    const registerForm = document.getElementById('registerForm');
    const submitRegBtn = document.getElementById('submitRegBtn');
    const loginForm = document.getElementById('loginForm');
    const submitLoginBtn = document.getElementById('submitLoginBtn');
    
    // Toggles
    const toggleToLogin = document.getElementById('toggleToLogin');
    const toggleToRegister = document.getElementById('toggleToRegister');

    // Success Modal Elements
    const successModal = document.getElementById('successModal');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');
    const successActionBtn = document.getElementById('successActionBtn');

    // Open Modal
    const openModal = (e) => {
        e.preventDefault();
        if (authModal) authModal.classList.add('active');
    };

    const authBtn = document.getElementById('authBtn');
    const triggerAuthBtns = document.querySelectorAll('.triggerAuth');
    if (authBtn) authBtn.addEventListener('click', openModal);
    triggerAuthBtns.forEach(btn => btn.addEventListener('click', openModal));

    // Close Modal
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            authModal.classList.remove('active');
            if (registerForm) registerForm.reset();
            if (loginForm) loginForm.reset();
        });
    }

    // Toggle logic
    if (toggleToLogin) {
        toggleToLogin.addEventListener('click', () => {
            registerView.classList.remove('active');
            loginView.classList.add('active');
        });
    }
    
    if (toggleToRegister) {
        toggleToRegister.addEventListener('click', () => {
            loginView.classList.remove('active');
            registerView.classList.add('active');
        });
    }

    // Custom Success Modal Function
    const showSuccessModal = (title, message, btnText, callback) => {
        authModal.classList.remove('active'); 
        if(successTitle) successTitle.innerText = title;
        if(successMessage) successMessage.innerText = message;
        if(successActionBtn) successActionBtn.innerText = btnText;
        if(successModal) successModal.classList.add('active');

        if(successActionBtn) {
            successActionBtn.onclick = () => {
                successModal.classList.remove('active');
                if (callback) callback();
            };
        }
    };

    // Handle Registration Submission
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const admission = document.getElementById('regAdmission').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const password = document.getElementById('regPassword').value;

            submitRegBtn.disabled = true;
            submitRegBtn.innerText = "Encrypting & Submitting...";
            showToast('Connecting to secure server...', 'success');

            const payload = {
                action: 'register',
                admission: admission,
                email: email,
                phone: phone,
                password: password
            };

            try {
                const response = await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.status === 'success') {
                    showSuccessModal(
                        "Registration Complete", 
                        "Your identity has been securely locked in the registry. You may now log in.", 
                        "Go to Login",
                        () => {
                            registerForm.reset();
                            authModal.classList.add('active');
                            registerView.classList.remove('active');
                            loginView.classList.add('active');
                        }
                    );
                } else {
                    showToast(result.message, 'alert');
                }

            } catch (error) {
                showToast('Network error. Check connection and try again.', 'alert');
            } finally {
                submitRegBtn.disabled = false;
                submitRegBtn.innerText = "Register Voter Account";
            }
        });
    }

    // Handle Login Submission
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const admission = document.getElementById('loginAdmission').value.trim();
            const password = document.getElementById('loginPassword').value;

            submitLoginBtn.disabled = true;
            submitLoginBtn.innerText = "Authenticating...";
            showToast('Verifying credentials...', 'success');

            const payload = {
                action: 'login',
                admission: admission,
                password: password
            };

            try {
                const response = await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // Securely store the token returned by the server
                    sessionStorage.setItem('rtc_voter_token', result.token);
                    sessionStorage.setItem('rtc_admission', result.admission);
                    
                    showSuccessModal(
                        "Authentication Validated", 
                        "Handshake successful. Redirecting to the secure dashboard...", 
                        "Enter Dashboard",
                        () => {
                            window.location.href = 'dashboard.html'; 
                        }
                    );
                } else {
                    showToast(result.message, 'alert'); 
                }

            } catch (error) {
                showToast('Authentication failed. Check your connection.', 'alert');
            } finally {
                submitLoginBtn.disabled = false;
                submitLoginBtn.innerText = "Authenticate Identity";
            }
        });
    }

});