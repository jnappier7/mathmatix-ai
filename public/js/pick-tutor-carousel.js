// public/js/pick-tutor-carousel.js
document.addEventListener('DOMContentLoaded', () => {
    const tutors = [
        {
            id: 'mr-nappier',
            name: 'Mr. Nappier',
            voiceId: '2eFQnnNM32GDnZkCfkSm',
            image: 'mr-nappier.png',
            catchphrase: "Math is about patterns! Once you see the patterns math becomes EASY",
            about: "Mr. Nappier believes math is an adventure, not a chore! He's enthusiastic about helping students conquer their math challenges by breaking down complex problems into simple, understandable steps. Whether it's tricky fractions or intimidating algebra, Mr. Nappier's friendly and patient approach makes learning math fun and accessible.",
            specialties: "Foundational Math (Arithmetic, Fractions, Decimals), Pre-Algebra, Algebra 1, building math confidence.",
            likes: "He makes math less scary and always finds a way to explain it so I finally get it!"
        },
        {
            id: 'mr-lee',
            name: 'Mr. Lee',
            voiceId: 'qRv1e4rqeMgBLK8HYz37',
            image: 'mr-lee.png',
            catchphrase: "Precision and clarity for every math concept.",
            about: "Mr. Lee is dedicated to building strong mathematical understanding. With a calm and methodical approach, he ensures students grasp not just *how* to solve problems, but *why* the methods work. He's excellent at guiding students through logical reasoning and complex problem-solving step-by-step, ensuring a solid foundation in all areas of math.",
            specialties: "Algebra I & II, Geometry, Problem-Solving Strategies, developing logical thinking in math.",
            likes: "He's incredibly clear and patient. My grades in Algebra improved a lot thanks to him."
        },
        {
            id: 'dr-jones',
            name: 'Dr. Jones',
            voiceId: 'aVR2rUXJY4MTezzJjPyQ',
            image: 'dr-jones.png',
            catchphrase: "Unlock the logic behind the numbers!",
            about: "Dr. Jones is passionate about critical thinking and loves to encourage students to ask 'why' in math. She brings a thoughtful and encouraging presence to every session, helping students develop strong analytical skills and a deeper appreciation for mathematical principles. She's great at preparing students for advanced topics.",
            specialties: "Pre-Calculus, Calculus AB, Statistics, advanced problem-solving, mathematical theory.",
            likes: "She challenges me to think more deeply about math, and now I see it in a whole new way!"
        },
        {
            id: 'prof-davies',
            name: 'Professor Davies',
            voiceId: 'jn34bTlmmOgOJU9XfPuy',
            image: 'prof-davies.png',
            catchphrase: "Years of wisdom, tailored to your math journey.",
            about: "Professor Davies brings a wealth of teaching experience and a warm demeanor to his math tutoring sessions. He excels at making complex mathematical concepts accessible and relatable, drawing on real-world examples to enhance understanding. He's a true mentor for any student looking to master challenging math.",
            specialties: "Advanced Algebra, Trigonometry, Test Preparation (SAT/ACT Math), conceptual understanding.",
            likes: "He explains things so well and makes even the hardest math subjects seem manageable and interesting."
        },
        {
            id: 'ms-alex',
            name: 'Ms. Alex',
            voiceId: '8DzKSPdgEQPaK5vKG0Rs',
            image: 'ms-alex.png',
            catchphrase: "Let's master those tricky math topics together!",
            about: "Alex is energetic and engaging, making every math lesson interactive and enjoyable. She's great at breaking down challenging concepts, finding creative ways to help students remember formulas and processes, and boosting confidence. She's a firm believer that anyone can succeed in math with the right guidance.",
            specialties: "Middle School Math, Algebra I, Geometry, Homework Help, building confidence.",
            likes: "She's super clear and enthusiastic, and she always helps me understand the steps to solve any problem."
        },
        {
            id: 'maya',
            name: 'Maya',
            voiceId: 'umKoJK6tP1ALjO0zo1EE',
            image: 'maya.png',
            catchphrase: "Learning math, your way!",
            about: "Maya is a friendly and approachable tutor who understands that everyone learns math differently. She's patient, adapts to individual learning paces, and is fantastic at building confidence in students who might feel intimidated by numbers. She makes sure students feel comfortable asking any question, no matter how small.",
            specialties: "Elementary Math, Basic Algebra, building fundamental math skills, individualized learning plans.",
            likes: "She's really understanding and helps me work through math problems at my own pace until I really get it."
        },
        {
            id: 'ms-maria',
            name: 'Ms. Maria',
            voiceId: 'kcQkGnn0HAT2JRDQ4Ljp',
            image: 'ms-maria.png',
            catchphrase: "Structured math learning for solid results.",
            about: "Ms. Maria is organized and thorough, providing a structured approach to math that helps students stay on track and achieve their goals. She's excellent at guiding students through curriculum requirements, test preparation, and ensuring a deep understanding of mathematical concepts.",
            specialties: "Bi-Lingual (Spanish/English), Pre-Algebra, Algebra I & II, Test Prep (e.g., state math tests), building strong foundational math skills.",
            likes: "She's very organized and helps me plan my math studying, which really works for me."
        },
        {
            id: 'bob',
            name: 'Bob',
            voiceId: 'UgBBYS2sOqTuMpoF3BR0',
            image: 'bob.png',
            catchphrase: "Bringing math concepts to life!",
            about: "Bob is an engaging and imaginative math tutor who loves to make learning vivid and memorable. He excels at connecting new mathematical information to real-world applications, helping students form a deeper and more lasting understanding of concepts. He makes even abstract math relatable.",
            specialties: "Geometry, Pre-Calculus, creative problem-solving, understanding theoretical math concepts.",
            likes: "He makes every math topic so interesting, and I learn so much more than just the formulas!"
        },
		{
            id: 'ms-rashida',
            name: 'Ms. Rashida',
            voiceId: '03vEurziQfq3V8WZhQvn',
            image: 'ms-rashida.png',
            catchphrase: "We don't panic. We pivot! Let's get this math",
            about: "Ms. Rashida is that rare mix of real talk and real results. She’s been where her students are — confused, overwhelmed, doubting themselves — and she’s mastered the art of helping them climb out of that headspace. Her sessions feel like a pep talk and a strategy session rolled into one. She teaches you how to stop being scared of math and start running it.",
            specialties: "Overcoming math anxiety, Algebra I & II, word problems with structure, “get it done” test prep, rebuilding math confidence.",
            likes: "She don’t sugarcoat nothing — but somehow I always feel smarter after we talk. Like I can do this."
        }
    ];

    const carouselTrack = document.querySelector('.carousel-track');
    const prevButton = document.querySelector('.carousel-button.prev');
    const nextButton = document.querySelector('.carousel-button.next');
    const selectTutorBtn = document.getElementById('select-tutor-btn');
    const playVoiceBtn = document.getElementById('play-voice-btn');

    const tutorName = document.getElementById('tutor-name');
    const tutorCatchphrase = document.getElementById('tutor-catchphrase');
    const tutorAbout = document.getElementById('tutor-about');
    const tutorSpecialties = document.getElementById('tutor-specialties');
    const tutorLikes = document.getElementById('tutor-likes');

    let currentIndex = 0;

    function renderTutors() {
        carouselTrack.innerHTML = '';
        tutors.forEach(tutor => {
            const slide = document.createElement('li');
            slide.classList.add('carousel-slide');
            const img = document.createElement('img');
            img.src = `images/${tutor.image}`; // Ensure 'images/' is the correct relative path from 'public/'
            img.alt = `3D avatar of ${tutor.name}`;
            img.classList.add('tutor-image');
            slide.appendChild(img);
            carouselTrack.appendChild(slide);
        });
    }

    function updateTutorDetails(index) {
        const currentTutor = tutors[index];
        tutorName.textContent = currentTutor.name;
        tutorCatchphrase.textContent = `"${currentTutor.catchphrase}"`;
        tutorAbout.textContent = currentTutor.about;
        tutorSpecialties.textContent = currentTutor.specialties;
        tutorLikes.textContent = currentTutor.likes;
        selectTutorBtn.innerHTML = `✅ Select ${currentTutor.name}`; // Updated to include checkmark icon

        playVoiceBtn.onclick = () => playVoice(currentTutor.voiceId, currentTutor.id);
    }

    function moveCarousel() {
        if (carouselTrack.children.length === 0) {
            console.warn("Carousel track has no children. Render function might not have completed.");
            return;
        }
        // Ensure initial rendering is complete before calculating width
        // A short delay might help if images are still loading
        const slideWidth = carouselTrack.children[0].getBoundingClientRect().width;
        carouselTrack.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
        updateTutorDetails(currentIndex);
    }

    prevButton.addEventListener('click', () => {
        currentIndex = (currentIndex === 0) ? tutors.length - 1 : currentIndex - 1;
        moveCarousel();
    });

    nextButton.addEventListener('click', () => {
        currentIndex = (currentIndex === tutors.length - 1) ? 0 : currentIndex + 1;
        moveCarousel();
    });

    selectTutorBtn.addEventListener('click', async () => {
        const selectedTutor = tutors[currentIndex];
        let userId = null;
        try {
            const userRes = await fetch('/user', { credentials: 'include' });
            if (!userRes.ok) {
                throw new Error('User not authenticated.');
            }
            const userData = await userRes.json();
            userId = userData.user._id;
        } catch (error) {
            console.error("Error fetching user ID:", error);
            alert("User session not found. Please log in again.");
            window.location.href = "/login.html";
            return;
        }

        if (!userId) {
            alert("User not logged in. Please log in.");
            window.location.href = "/login.html";
            return;
        }

        try {
            // [FIX] Removed /api/ prefix from the endpoint
            const response = await fetch(`/user/select-tutor`, { // Changed from /api/user/select-tutor to /user/select-tutor
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                },
                credentials: 'include',
                body: JSON.stringify({ userId, tutorId: selectedTutor.id })
            });

            const result = await response.json();
            if (response.ok) { // Check response.ok for success
                window.location.href = "/chat.html"; // Server should update user.selectedTutorId
            } else {
                alert("Failed to select tutor: " + (result.message || "Unknown error"));
            }
        } catch (error) {
            console.error("Error selecting tutor:", error);
            alert("An error occurred while selecting your tutor. Please try again.");
        }
    });

    async function playVoice(voiceId, tutorId) {
        const customPhrases = {
            "mr-nappier": "Hi, I'm Mr. Nappier, and I believe that math is about PATTERNS. Once you see the patterns, math becomes EASY!",
            "mr-lee": "Hello, I’m Mr. Lee. I believe math should be precise, purposeful, and peaceful.",
            "dr-jones": "Hi, I’m Dr. Jones. I believe every math problem is a PUZZLE waiting to make you smarter.",
            "prof-davies": "Good day, I’m Professor Davies. I believe math is LESS about answers, and MORE about understanding.",
            "ms-alex": "Hey y’all, I’m Ms. Alex. I believe math should make sense — and you deserve to feel confident.",
            "maya": "What's up, I’m Maya. I believe in taking your time, asking questions, and making math feel like it’s yours.",
            "ms-maria": "¿Qué pasa?, I’m Ms. Maria. I believe math grows best with structure, patience, and a little encouragement.",
            "bob": "Yo! I’m Bob, and I believe math’s way more fun when it clicks with real life.",
            "ms-rashida": "Hey, I’m Ms. Rashida. I believe that math hits different when you add a lil’ flayva! I don’t do boring."
        };

        const previewText = customPhrases[tutorId] || `Hi! I’m your tutor, and I can’t wait to help you learn math.`;

        try {
            const res = await fetch("/speak-test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: previewText, voiceId })
            });
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.play();
        } catch (err) {
            console.error("Voice playback failed:", err);
            alert("Could not play voice preview.");
        }
    }

    renderTutors();
    updateTutorDetails(currentIndex);
    // Use setTimeout for moveCarousel to ensure images are loaded and widths are correct
    window.addEventListener('load', () => setTimeout(moveCarousel, 100));
});