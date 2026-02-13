/* ============================================
   Big Picture Policies - Project Page Scripts
   Scroll-driven animation + utilities
   ============================================ */

// ============================================
// 1. Configuration & Caches
// ============================================
const KEYFRAME_TIMES = [12.9, 22.6];
const NAIVE_INTERVAL = 3;
const NAIVE_COUNT = 4;
const TOTAL_SLOTS = 5;
const DURATION = 25.0;

// Wrist frames: small, high FPS (for bottom strip)
const WRIST_INTERVAL = 0.1;  // 10 FPS
const WRIST_W = 424, WRIST_H = 240;

// Overhead frames: large, lower FPS (for main video)
const OVERHEAD_INTERVAL = 0.333;  // 3 FPS
const OVERHEAD_W = 848, OVERHEAD_H = 480;

// Background color transition colors
const BG_COLOR_LIGHT = { r: 248, g: 249, b: 250 };  // #f8f9fa (same as --bg-light)
const BG_COLOR_DARK = { r: 58, g: 58, b: 72 };      // #3a3a48

// Text color transition colors (inverse of background)
const TEXT_COLOR_DARK = { r: 26, g: 26, b: 46 };    // #1a1a2e (dark text on light bg)
const TEXT_COLOR_LIGHT = { r: 255, g: 255, b: 255 }; // #ffffff (light text on dark bg)

const wristFrameCache = new Map();
const overheadFrameCache = new Map();

// Animation duration and speed
const ANIMATION_DURATION = 60; // Total animation duration in seconds (how long to go through all segments)

// ============================================
// 2. DOM References (populated on DOMContentLoaded)
// ============================================
let scrollSection, scrollContainer, scrollSticky;
let overheadCanvas, overheadCtx, overheadWrap;
let naiveSlots = [], bppSlots = [];
let naiveContainer, bppContainer, frameStripsWrapper;
let msg1, msg2, msg3, msg4, bppTitle;
let scrollSectionHeader;
let policyInputHighlight;
let trajectorySliderContainer, trajectorySliderProgress, trajectorySliderThumb;
let animationControls, playPauseBtn, animationSliderTrack, animationSliderProgress, animationSliderThumb;
let cacheReady = false;

// Animation state
let isPlaying = false;
let animationProgress = 0; // 0 to 1
let lastFrameTime = null;
let isDragging = false;

// ============================================
// 2.5. Color Interpolation Utilities
// ============================================
function interpolateColor(color1, color2, factor) {
    // Clamp factor between 0 and 1
    factor = Math.max(0, Math.min(1, factor));
    return {
        r: Math.round(color1.r + (color2.r - color1.r) * factor),
        g: Math.round(color1.g + (color2.g - color1.g) * factor),
        b: Math.round(color1.b + (color2.b - color1.b) * factor)
    };
}

function colorToHex(color) {
    const toHex = (c) => c.toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function calculateBackgroundColor(progress) {
    // Always light background
    return colorToHex(BG_COLOR_LIGHT);
}

function calculateTextColor(progress) {
    // Always dark text on light background
    return colorToHex(TEXT_COLOR_DARK);
}

// ============================================
// 3. Frame Cache Utilities
// ============================================
function roundTime(t, interval) {
    return Math.round(t / interval) * interval;
}

function getCachedFrame(cache, time, interval) {
    const key = roundTime(Math.max(0, Math.min(time, DURATION)), interval);
    return cache.get(key) || null;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
    });
}

async function loadFrameImages() {
    const loadingFill = document.getElementById('scrollLoadingFill');
    const loadingText = document.getElementById('scrollLoadingText');

    const wristFrameCount = Math.ceil(DURATION / WRIST_INTERVAL);
    const overheadFrameCount = Math.floor(DURATION / OVERHEAD_INTERVAL);
    const totalImages = wristFrameCount + overheadFrameCount;
    let loaded = 0;

    const framePromises = [];

    // Wrist frames (10 FPS, small)
    for (let i = 0; i < wristFrameCount; i++) {
        const time = roundTime(i * WRIST_INTERVAL, WRIST_INTERVAL);
        const frameIdx = String(i).padStart(4, '0');

        framePromises.push(
            loadImage(`frames/wrist_${frameIdx}.jpg`)
                .then(img => {
                    loaded++;
                    const pct = Math.round((loaded / totalImages) * 100);
                    if (loadingFill) loadingFill.style.width = pct + '%';
                    if (loadingText) loadingText.textContent = `Loading frames... ${pct}%`;
                    return { type: 'wrist', time, img, w: WRIST_W, h: WRIST_H };
                })
                .catch(() => {
                    loaded++;
                    return null;
                })
        );
    }

    // Overhead frames (3 FPS, large)
    for (let i = 0; i < overheadFrameCount; i++) {
        const time = roundTime(i * OVERHEAD_INTERVAL, OVERHEAD_INTERVAL);
        const frameIdx = String(i).padStart(4, '0');

        framePromises.push(
            loadImage(`frames/overhead_${frameIdx}.jpg`)
                .then(img => {
                    loaded++;
                    const pct = Math.round((loaded / totalImages) * 100);
                    if (loadingFill) loadingFill.style.width = pct + '%';
                    if (loadingText) loadingText.textContent = `Loading frames... ${pct}%`;
                    return { type: 'overhead', time, img, w: OVERHEAD_W, h: OVERHEAD_H };
                })
                .catch(() => {
                    loaded++;
                    return null;
                })
        );
    }

    // Load all images in parallel
    const results = await Promise.all(framePromises);

    // Store images in caches
    for (const result of results) {
        if (!result) continue;
        const { type, time, img, w, h } = result;

        // Convert image to canvas for consistent rendering
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        if (type === 'wrist') {
            wristFrameCache.set(time, canvas);
        } else {
            overheadFrameCache.set(time, canvas);
        }
    }

    // Hide loading overlay
    const loadingOverlay = document.getElementById('scrollLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => loadingOverlay.style.display = 'none', 500);
    }

    cacheReady = true;
}

// ============================================
// 4. Slot Creation & Utilities
// ============================================
function createSlots(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const slots = [];
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'scroll-frame-slot empty';
        if (i === count - 1) div.classList.add('current');

        const canvas = document.createElement('canvas');
        canvas.width = WRIST_W;
        canvas.height = WRIST_H;
        div.appendChild(canvas);

        // Keyframe capture overlay
        const overlay = document.createElement('div');
        overlay.className = 'keyframe-overlay';
        overlay.textContent = 'Keyframe';
        div.appendChild(overlay);

        const label = document.createElement('div');
        label.className = 'frame-label';
        div.appendChild(label);

        container.appendChild(div);
        slots.push({ div, canvas, ctx: canvas.getContext('2d'), label, overlay });
    }
    return slots;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, '0')}`;
}

function updateTrajectorySlider(videoTime, isLightBg) {
    if (!trajectorySliderContainer) return;

    // Toggle light background styling
    trajectorySliderContainer.classList.toggle('light-bg', isLightBg);

    // Update progress bar and thumb position based on video time
    const percentage = (videoTime / DURATION) * 100;

    if (trajectorySliderProgress) {
        trajectorySliderProgress.style.width = percentage + '%';
    }
    if (trajectorySliderThumb) {
        trajectorySliderThumb.style.left = percentage + '%';
    }
}

function updateAnimationControls(progress, isLightBg) {
    if (!animationControls) return;

    // Toggle light background styling
    animationControls.classList.toggle('light-bg', isLightBg);

    // Update progress bar and thumb position based on animation progress
    const percentage = progress * 100;

    if (animationSliderProgress) {
        animationSliderProgress.style.width = percentage + '%';
    }
    if (animationSliderThumb) {
        animationSliderThumb.style.left = percentage + '%';
    }
}

function clearSlot(slot) {
    slot.ctx.fillStyle = '#1a1a24';
    slot.ctx.fillRect(0, 0, slot.canvas.width, slot.canvas.height);
    slot.label.textContent = '';
    slot.div.classList.add('empty');
}

function drawCachedFrame(ctx, cache, time, interval) {
    const frame = getCachedFrame(cache, time, interval);
    if (frame) {
        ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height);
        return true;
    }
    return false;
}

// ============================================
// 5. Rendering Functions
// ============================================
function renderNaiveFrames(currentTime, showFailureHighlight = false) {
    for (let i = NAIVE_COUNT; i >= 0; i--) {
        const slotIdx = NAIVE_COUNT - i;
        const t = currentTime - i * NAIVE_INTERVAL;
        const slot = naiveSlots[slotIdx];
        if (!slot) continue;

        if (t < 0) {
            // Hide empty slots
            slot.div.style.display = 'none';
            slot.label.textContent = '';
        } else {
            slot.div.style.display = '';
            drawCachedFrame(slot.ctx, wristFrameCache, t, WRIST_INTERVAL);
            slot.label.textContent = (i === 0) ? 'Current Obs' : formatTime(t) + 's';
            slot.div.classList.remove('empty');
        }
        slot.div.classList.toggle('current', i === 0);
        // Highlight the two rightmost past observation frames (failed grasps) when msg2 is visible
        slot.div.classList.toggle('failure-highlight', showFailureHighlight && (i === 1 || i === 2));
    }
}

function renderBppFrames(currentTime, captureProgress = 0) {
    const isCapturing = captureProgress > 0 && captureProgress < 1;

    // During animation (0 < captureProgress < 1): PRE-capture layout (exclude keyframe at currentTime)
    // Otherwise: POST-capture layout (include keyframe at or before currentTime)
    // This ensures smooth transition when animation completes
    const seenKeyframes = isCapturing
        ? KEYFRAME_TIMES.filter(t => t < currentTime)
        : KEYFRAME_TIMES.filter(t => t <= currentTime);
    const bppEntries = [...seenKeyframes, currentTime];
    const bppDisplay = bppEntries.slice(-TOTAL_SLOTS);
    const numEntries = bppDisplay.length;

    // Two-phase animation (both use PRE-capture layout):
    // Phase 1 (0-0.6): Overlay fades in, pauses, then fades out
    // Phase 2 (0.6-1.0): All frames slide LEFT
    const inPhase1 = isCapturing && captureProgress <= 0.6;
    const inPhase2 = isCapturing && captureProgress > 0.6;

    // Overlay opacity: fade in 0-0.15, pause 0.15-0.45, fade out 0.45-0.6
    let overlayOpacity = 0;
    if (inPhase1) {
        if (captureProgress < 0.15) {
            overlayOpacity = captureProgress / 0.15;  // 0->1
        } else if (captureProgress < 0.45) {
            overlayOpacity = 1;  // stay visible
        } else {
            overlayOpacity = (0.6 - captureProgress) / 0.15;  // 1->0
        }
    }

    // Slide progress: 0 to 1 during phase 2
    const slideProgress = inPhase2 ? (captureProgress - 0.6) / 0.4 : 0;

    // Calculate actual slot step in pixels
    // Use the rightmost slot (TOTAL_SLOTS-1) which is always visible
    let slotStepPx = 0;
    const visibleSlot = bppSlots[TOTAL_SLOTS - 1];
    if (visibleSlot && visibleSlot.div) {
        const slotRect = visibleSlot.div.getBoundingClientRect();
        slotStepPx = slotRect.width + 6;
    }

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slot = bppSlots[i];
        if (!slot) continue;

        const posFromRight = TOTAL_SLOTS - 1 - i;
        const entryFromRight = numEntries - 1 - posFromRight;

        if (entryFromRight < 0) {
            slot.div.style.display = 'none';
            slot.div.style.transform = '';
            slot.label.textContent = '';
            if (slot.overlay) slot.overlay.style.opacity = '0';
        } else {
            const t = bppDisplay[entryFromRight];
            const isCurrentFrame = (entryFromRight === numEntries - 1);

            slot.div.style.display = '';
            slot.div.classList.remove('empty');
            slot.div.style.boxShadow = '';
            slot.div.style.borderColor = '';
            slot.div.style.opacity = '1';

            // Phase 1: Show overlay on current frame
            if (inPhase1 && isCurrentFrame) {
                if (slot.overlay) slot.overlay.style.opacity = overlayOpacity.toString();
            } else {
                if (slot.overlay) slot.overlay.style.opacity = '0';
            }

            // Phase 2: ALL visible frames slide LEFT
            if (inPhase2) {
                const slideOffsetPx = slideProgress * slotStepPx;
                slot.div.style.transform = `translateX(-${slideOffsetPx}px)`;
            } else {
                slot.div.style.transform = '';
            }

            drawCachedFrame(slot.ctx, wristFrameCache, t, WRIST_INTERVAL);

            slot.label.textContent = isCurrentFrame
                ? 'Current obs'
                : `KF @ ${formatTime(t)}s`;
        }
        slot.div.classList.toggle('current', i === TOTAL_SLOTS - 1);
    }
}

// ============================================
// 6. Message Helpers
// ============================================
function positionMessage(msg, segProgress) {
    // Use container height for responsive positioning
    const containerHeight = scrollSticky ? scrollSticky.offsetHeight : window.innerHeight;

    // Get message height to properly center it
    const msgHeight = msg ? msg.offsetHeight : 100;

    // Calculate video center position relative to container
    let videoCenterY = containerHeight * 0.34; // fallback
    if (overheadWrap && scrollSticky) {
        const containerRect = scrollSticky.getBoundingClientRect();
        const videoRect = overheadWrap.getBoundingClientRect();
        const videoTopRelative = videoRect.top - containerRect.top;
        videoCenterY = videoTopRelative + videoRect.height / 2;
    }

    // Start: below center (positive Y)
    // End: message center aligned with video center
    // Messages use top: 50%, so finalY = videoCenterY - containerHeight/2 - msgHeight/2
    const startY = containerHeight * 0.12;
    const finalY = videoCenterY - containerHeight / 2 - msgHeight / 2;

    let y, opacity;

    if (segProgress < 0.1) {
        // Phase 1: Scroll from start to final position (fast)
        const phaseProgress = segProgress / 0.1;
        y = startY + phaseProgress * (finalY - startY);
        opacity = 1.0;
    } else if (segProgress < 0.85) {
        // Phase 2: Pause at final position for reading
        y = finalY;
        opacity = 1.0;
    } else {
        // Phase 3: Fade out in place (no movement)
        y = finalY;
        const phaseProgress = (segProgress - 0.85) / 0.15;
        opacity = 1 - phaseProgress;
    }

    msg.style.transform = `translateX(-50%) translateY(${y}px)`;
    msg.style.opacity = opacity;

    // Return current Y for row following calculation
    return y;
}

function hideMessage(msg) {
    msg.style.opacity = '0';
    msg.style.transform = 'translateX(-50%) translateY(120px)';
}

// Cache for naive row baseline position
let naiveRowBaselineTop = null;

function measureNaiveRowBaseline() {
    if (!naiveContainer || !scrollSticky) return;

    // Temporarily reset transform to measure natural position
    const currentTransform = naiveContainer.style.transform;
    naiveContainer.style.transform = '';

    const containerRect = scrollSticky.getBoundingClientRect();
    const rowRect = naiveContainer.getBoundingClientRect();
    naiveRowBaselineTop = rowRect.top - containerRect.top;

    // Restore transform
    naiveContainer.style.transform = currentTransform;
}

function positionNaiveRow(textY, follow = false) {
    if (!naiveContainer || !scrollSticky) return false;

    if (follow) {
        // Measure baseline on first call
        if (naiveRowBaselineTop === null) {
            measureNaiveRowBaseline();
        }
        if (naiveRowBaselineTop === null) return false;

        const containerHeight = scrollSticky.offsetHeight;
        const containerCenter = containerHeight / 2;

        // Get message height for calculating text bottom
        const msgHeight = msg2 ? msg2.offsetHeight : 100;
        const gap = 25;  // Gap between text bottom and row top

        // Text bottom position from container top
        // Message CSS: top: 50% positions TOP edge at containerCenter
        // Then translateY(textY) moves it, so:
        // - Message TOP = containerCenter + textY
        // - Message BOTTOM = containerCenter + textY + msgHeight
        const textBottomFromTop = containerCenter + textY + msgHeight;

        // Where should the row top be? Just below text bottom with a gap
        const targetRowTop = textBottomFromTop + gap;

        // How much to move up (only positive values - don't move down)
        const moveAmount = Math.max(0, naiveRowBaselineTop - targetRowTop);

        naiveContainer.style.transform = `translateY(-${moveAmount}px)`;

        // Return whether we're moving (for blur logic)
        return moveAmount > 0;
    } else {
        naiveContainer.style.transform = '';
        return false;
    }
}

function resetNaiveRowBaseline() {
    naiveRowBaselineTop = null;
}

// Cache for frame strips wrapper baseline position
let frameStripsBaselineTop = null;

function measureFrameStripsBaseline() {
    if (!frameStripsWrapper || !scrollSticky) return;

    // Temporarily reset transform to measure natural position
    const currentTransform = frameStripsWrapper.style.transform;
    frameStripsWrapper.style.transform = '';

    const containerRect = scrollSticky.getBoundingClientRect();
    const wrapperRect = frameStripsWrapper.getBoundingClientRect();
    frameStripsBaselineTop = wrapperRect.top - containerRect.top;

    // Restore transform
    frameStripsWrapper.style.transform = currentTransform;
}

function resetFrameStripsBaseline() {
    frameStripsBaselineTop = null;
}

// Position message for BPP phase
function positionMessage4(msg, segProgress) {
    const containerHeight = scrollSticky ? scrollSticky.offsetHeight : window.innerHeight;
    const msgHeight = msg ? msg.offsetHeight : 100;

    // Calculate video center position relative to container
    let videoCenterY = containerHeight * 0.34; // fallback
    if (overheadWrap && scrollSticky) {
        const containerRect = scrollSticky.getBoundingClientRect();
        const videoRect = overheadWrap.getBoundingClientRect();
        const videoTopRelative = videoRect.top - containerRect.top;
        videoCenterY = videoTopRelative + videoRect.height / 2;
    }

    // Start: below center (positive Y)
    // End: message center aligned with video center
    const startY = containerHeight * 0.12;
    const finalY = videoCenterY - containerHeight / 2 - msgHeight / 2;

    let y, opacity;

    if (segProgress < 0.1) {
        // Phase 1: Scroll from start to final position (fast)
        const phaseProgress = segProgress / 0.1;
        y = startY + phaseProgress * (finalY - startY);
        opacity = 1.0;
    } else if (segProgress < 0.85) {
        // Phase 2: Pause at final position for reading
        y = finalY;
        opacity = 1.0;
    } else {
        // Phase 3: Fade out in place (no movement)
        y = finalY;
        const phaseProgress = (segProgress - 0.85) / 0.15;
        opacity = 1 - phaseProgress;
    }

    msg.style.transform = `translateX(-50%) translateY(${y}px)`;
    msg.style.opacity = opacity;

    return y;
}

// Position BOTH rows (via wrapper) to follow msg4 text during BPP phase
// fadeProgress: 0 = fully following, 1 = fully returned to original position
function positionFrameStrips(textY, follow = false, fadeProgress = 0) {
    if (!frameStripsWrapper || !scrollSticky) return false;

    if (follow) {
        // Measure baseline on first call
        if (frameStripsBaselineTop === null) {
            measureFrameStripsBaseline();
        }
        if (frameStripsBaselineTop === null) return false;

        const containerHeight = scrollSticky.offsetHeight;
        const containerCenter = containerHeight / 2;

        // Get message height for calculating text bottom
        const msgHeight = msg4 ? msg4.offsetHeight : 100;
        const gap = 25;  // Gap between text bottom and wrapper top

        // Text bottom position from container top
        const textBottomFromTop = containerCenter + textY + msgHeight;

        // Only start moving when text bottom actually reaches the wrapper's position
        // This ensures rows follow AFTER text passes them, like the first phase
        if (textBottomFromTop <= frameStripsBaselineTop) {
            const targetWrapperTop = textBottomFromTop + gap;
            let moveAmount = frameStripsBaselineTop - targetWrapperTop;

            // During fade-out, smoothly return to original position
            if (fadeProgress > 0) {
                moveAmount = moveAmount * (1 - fadeProgress);
            }

            frameStripsWrapper.style.transform = `translateY(-${moveAmount}px)`;
            return moveAmount > 0;
        } else {
            // Text hasn't reached the wrapper yet, don't move
            frameStripsWrapper.style.transform = '';
            return false;
        }
    } else {
        frameStripsWrapper.style.transform = '';
        return false;
    }
}

// ============================================
// 7. Main Update Function
// ============================================
let lastProgress = -1;

function updateAnimation(progress) {
    if (!cacheReady) return;

    // Clamp progress
    progress = Math.max(0, Math.min(1, progress));

    // Skip if progress hasn't changed meaningfully
    if (Math.abs(progress - lastProgress) < 0.0001) return;
    lastProgress = progress;

    // Update background color based on progress
    if (scrollSticky) {
        const bgColor = calculateBackgroundColor(progress);
        scrollSticky.style.backgroundColor = bgColor;
    }

    // Update section header text color based on progress
    if (scrollSectionHeader) {
        const textColor = calculateTextColor(progress);
        scrollSectionHeader.style.color = textColor;
    }

    // Update policy input highlight visibility
    // Fade in: 0.21 → 0.23, stay visible: 0.23 → 0.26, fade out: 0.26 → 0.29
    if (policyInputHighlight) {
        let highlightOpacity = 0;
        if (progress >= 0.21 && progress < 0.23) {
            // Fade in
            highlightOpacity = (progress - 0.21) / 0.02;
        } else if (progress >= 0.23 && progress < 0.26) {
            // Stay visible
            highlightOpacity = 1;
        } else if (progress >= 0.26 && progress < 0.29) {
            // Fade out
            highlightOpacity = 1 - (progress - 0.26) / 0.03;
        }
        policyInputHighlight.style.opacity = highlightOpacity;
    }

    // Hide all messages by default
    hideMessage(msg1);
    hideMessage(msg2);
    hideMessage(msg3);
    hideMessage(msg4);

    // Reset BPP title (will be animated in segment H)
    bppTitle.style.opacity = '0';
    bppTitle.style.top = '100%';
    bppTitle.style.transform = 'translate(-50%, -50%) scale(1)';
    bppTitle.style.background = 'rgba(0, 0, 0, 0.5)';

    // ====== Segment logic ======
    let videoTime = 0;
    let showNaive = true;
    let showBpp = false;
    let bppCaptureProgress = 0;

    // Default: clear overhead blur and reset row positions
    // (will be overridden in segments E, F, and I4b)
    if (overheadWrap) {
        overheadWrap.classList.remove('blurred');
    }
    positionNaiveRow(0, false);
    if (frameStripsWrapper) {
        frameStripsWrapper.style.transform = '';
    }

    // Video rate constants for consistent playback speed
    // Base rate: covers 22.6s video across available playback progress
    // Playback progress = 0.08 (seg A) + 0.00225 equivalent (seg B slide-up at 1/4x) + 0.21 (seg D) = 0.29225
    // Rate = 22.6 / 0.29225 ≈ 77.3 video-seconds per progress unit
    const VIDEO_RATE_1X = 77.3;
    const VIDEO_RATE_QUARTER = VIDEO_RATE_1X / 4;

    // Pre-calculate video time landmarks
    const VIDEO_AFTER_SEG_A = 0.08 * VIDEO_RATE_1X;  // ~6.18s
    const MSG1_SLIDE_PROGRESS = 0.1 * 0.09;  // 0.009 (slide-up is 10% of msg1's 0.09 progress range)
    const VIDEO_AFTER_MSG1_SLIDE = VIDEO_AFTER_SEG_A + MSG1_SLIDE_PROGRESS * VIDEO_RATE_QUARTER;  // ~6.36s

    if (progress < 0.08) {
        // Segment A: no text, 1x speed
        videoTime = progress * VIDEO_RATE_1X;  // 0 to ~6.18s
        showNaive = true;
        showBpp = false;

    } else if (progress < 0.17) {
        // Segments B+C: msg1 animation (25% shorter duration)
        const msgProgress = (progress - 0.08) / 0.09;

        if (msgProgress < 0.1) {
            // Slide-up phase: 1/4x speed (video was playing, no previous text)
            const slideProgress = progress - 0.08;  // 0 to 0.009
            videoTime = VIDEO_AFTER_SEG_A + slideProgress * VIDEO_RATE_QUARTER;
        } else {
            // Reading/fade phase: paused
            videoTime = VIDEO_AFTER_MSG1_SLIDE;  // ~6.36s
        }

        positionMessage(msg1, msgProgress);
        showNaive = true;
        showBpp = false;

        // Blur overhead video during reading phase (0.1 to 0.85)
        if (overheadWrap && msgProgress >= 0.1 && msgProgress < 0.85) {
            overheadWrap.classList.add('blurred');
        }

    } else if (progress < 0.38) {
        // Segment D: no text, 1x speed
        const segProgress = progress - 0.17;  // 0 to 0.21
        videoTime = VIDEO_AFTER_MSG1_SLIDE + segProgress * VIDEO_RATE_1X;  // ~6.36s to ~22.6s
        showNaive = true;
        showBpp = false;

    } else if (progress < 0.52) {
        // Segment E: paused at 22.6s, message 2 animates
        // segProgress 0-0.1: slide up, 0.1-0.85: reading, 0.85-1: fade out
        const segProgress = (progress - 0.38) / 0.14;
        videoTime = 22.6;
        const textY = positionMessage(msg2, segProgress);
        showNaive = true;
        showBpp = false;

        // Make frame strips follow the text (no return yet - stays up for msg3)
        const isRowMoving = positionFrameStrips(textY, true, 0);
        if (overheadWrap && (isRowMoving || segProgress >= 0.1)) {
            overheadWrap.classList.add('blurred');
        }

    } else if (progress < 0.59) {
        // Segment F: paused at 22.6s, message 3 scrolls up
        const segProgress = (progress - 0.52) / 0.07;
        videoTime = 22.6;
        positionMessage(msg3, segProgress);
        showNaive = true;
        showBpp = false;

        // Keep blur on overhead video
        if (overheadWrap) {
            overheadWrap.classList.add('blurred');
        }

        // Calculate fade progress for smooth return (0 during follow, 0->1 during fade-out)
        const fadeProgress = segProgress >= 0.85 ? (segProgress - 0.85) / 0.15 : 0;

        // Keep frame strips at final position, smoothly return during fade-out
        const containerHeight = scrollSticky ? scrollSticky.offsetHeight : window.innerHeight;
        const msgHeight = msg2 ? msg2.offsetHeight : 100;
        // Calculate video center position relative to container (same as positionMessage)
        let videoCenterY = containerHeight * 0.34; // fallback
        if (overheadWrap && scrollSticky) {
            const containerRect = scrollSticky.getBoundingClientRect();
            const videoRect = overheadWrap.getBoundingClientRect();
            const videoTopRelative = videoRect.top - containerRect.top;
            videoCenterY = videoTopRelative + videoRect.height / 2;
        }
        const finalTextY = videoCenterY - containerHeight / 2 - msgHeight / 2;
        positionFrameStrips(finalTextY, true, fadeProgress);

    } else if (progress < 0.62) {
        // Segment G: rewind 22.6→0s
        const segProgress = (progress - 0.59) / 0.03;
        videoTime = 22.6 * (1 - segProgress);
        showNaive = true;
        showBpp = false;  // BPP row hidden during rewind
        if (naiveContainer) {
            naiveContainer.style.opacity = '1';
        }

    } else if (progress < 0.635) {
        // Segment H1: paused at 0s, BPP title rises from bottom to middle of video
        const segProgress = (progress - 0.62) / 0.015;
        videoTime = 0;
        showNaive = true;
        showBpp = false;  // BPP row hidden while title is showing
        if (naiveContainer) naiveContainer.style.opacity = '1';

        // Calculate video center as percentage of container height
        let videoCenterPercent = 34; // fallback
        if (overheadWrap && scrollSticky) {
            const containerRect = scrollSticky.getBoundingClientRect();
            const videoRect = overheadWrap.getBoundingClientRect();
            const videoTopRelative = videoRect.top - containerRect.top;
            const videoCenterY = videoTopRelative + videoRect.height / 2;
            videoCenterPercent = (videoCenterY / containerRect.height) * 100;
        }

        // Animate title from bottom (100%) to video center
        const topPercent = 100 - segProgress * (100 - videoCenterPercent);
        bppTitle.style.top = topPercent + '%';
        bppTitle.style.opacity = Math.min(1, segProgress * 2); // Fade in quickly
        bppTitle.style.transform = 'translate(-50%, -50%)';
        bppTitle.style.padding = '20px 40px';
        bppTitle.style.background = 'rgba(0, 0, 0, 0.5)';

    } else if (progress < 0.65) {
        // Segment H2: Pause - title stays in place
        videoTime = 0;
        showNaive = true;
        showBpp = false;  // BPP row hidden while title is showing
        if (naiveContainer) naiveContainer.style.opacity = '1';

        // Calculate video center as percentage of container height
        let videoCenterPercent = 34; // fallback
        if (overheadWrap && scrollSticky) {
            const containerRect = scrollSticky.getBoundingClientRect();
            const videoRect = overheadWrap.getBoundingClientRect();
            const videoTopRelative = videoRect.top - containerRect.top;
            const videoCenterY = videoTopRelative + videoRect.height / 2;
            videoCenterPercent = (videoCenterY / containerRect.height) * 100;
        }

        bppTitle.style.top = videoCenterPercent + '%';
        bppTitle.style.opacity = '1';
        bppTitle.style.transform = 'translate(-50%, -50%)';
        bppTitle.style.padding = '20px 40px';
        bppTitle.style.background = 'rgba(0, 0, 0, 0.5)';

    } else if (progress < 0.67) {
        // Segment H3: BPP title "pops" - background expands and fades out
        const segProgress = (progress - 0.65) / 0.02;
        videoTime = 0;
        showNaive = true;
        showBpp = false;  // BPP row hidden while title is fading
        if (naiveContainer) naiveContainer.style.opacity = '1';

        // Calculate video center as percentage of container height
        let videoCenterPercent = 34; // fallback
        if (overheadWrap && scrollSticky) {
            const containerRect = scrollSticky.getBoundingClientRect();
            const videoRect = overheadWrap.getBoundingClientRect();
            const videoTopRelative = videoRect.top - containerRect.top;
            const videoCenterY = videoTopRelative + videoRect.height / 2;
            videoCenterPercent = (videoCenterY / containerRect.height) * 100;
        }

        // Pop animation: background expands via padding, fades out
        const paddingV = 20 + segProgress * 40; // 20px -> 60px
        const paddingH = 40 + segProgress * 80; // 40px -> 120px
        const opacity = 1 - segProgress; // 1 -> 0
        const bgOpacity = 0.5 - segProgress * 0.5; // 0.5 -> 0

        bppTitle.style.top = videoCenterPercent + '%';
        bppTitle.style.opacity = opacity;
        bppTitle.style.transform = 'translate(-50%, -50%)';
        bppTitle.style.padding = `${paddingV}px ${paddingH}px`;
        bppTitle.style.background = `rgba(0, 0, 0, ${bgOpacity})`;

    } else if (progress < 0.725) {
        // Segment I1: Play 0 → 12.9s (first keyframe)
        // Linear interpolation for smooth playback within segment
        const segProgress = (progress - 0.67) / 0.055;
        videoTime = segProgress * 12.9;
        showNaive = true;  // Keep naive visible below BPP
        showBpp = true;
        bppCaptureProgress = 0;
        if (naiveContainer) naiveContainer.style.opacity = '1';

    } else if (progress < 0.76) {
        // Segment I2: Pause at 12.9s - keyframe capture animation (increased pause)
        const segProgress = (progress - 0.725) / 0.035;
        videoTime = 12.9;
        showNaive = true;  // Keep naive visible below BPP
        showBpp = true;
        bppCaptureProgress = segProgress;
        if (naiveContainer) naiveContainer.style.opacity = '1';

    } else if (progress < 0.815) {
        // Segment I3: Play 12.9 → 22.6s (second keyframe)
        // Linear interpolation for smooth playback within segment
        const segProgress = (progress - 0.76) / 0.055;
        videoTime = 12.9 + segProgress * (22.6 - 12.9);
        showNaive = true;  // Keep naive visible below BPP
        showBpp = true;
        bppCaptureProgress = 0;
        if (naiveContainer) naiveContainer.style.opacity = '1';

    } else if (progress < 0.85) {
        // Segment I4: Pause at 22.6s - keyframe capture animation (increased pause)
        const segProgress = (progress - 0.815) / 0.035;
        videoTime = 22.6;
        showNaive = true;  // Keep naive visible below BPP
        showBpp = true;
        bppCaptureProgress = segProgress;
        if (naiveContainer) naiveContainer.style.opacity = '1';

    } else if (progress < 0.954) {
        // Segment I4b: Pause at 22.6s - msg4 explanation text animation (30% longer)
        const segProgress = (progress - 0.85) / 0.104;
        videoTime = 22.6;
        const textY = positionMessage4(msg4, segProgress);
        showNaive = true;
        showBpp = true;
        bppCaptureProgress = 0;
        if (naiveContainer) naiveContainer.style.opacity = '1';

        // Calculate fade progress for smooth return (0 during follow, 0->1 during fade-out)
        const fadeProgress = segProgress >= 0.85 ? (segProgress - 0.85) / 0.15 : 0;

        // Rows follow text after it passes them, smoothly return during fade-out
        const isRowMoving = positionFrameStrips(textY, true, fadeProgress);
        if (overheadWrap && isRowMoving) {
            overheadWrap.classList.add('blurred');
        }

    } else if (progress < 0.975) {
        // Segment I5: Play 22.6 → 25s (end)
        // Linear interpolation for smooth playback within segment
        const segProgress = (progress - 0.954) / 0.021;
        videoTime = 22.6 + segProgress * (DURATION - 22.6);
        showNaive = true;  // Keep naive visible below BPP
        showBpp = true;
        bppCaptureProgress = 0;
        if (naiveContainer) naiveContainer.style.opacity = '1';

        // Reset wrapper position and baseline
        positionFrameStrips(0, false);
        resetFrameStripsBaseline();

    } else {
        // Segment I6: End pause (1.5 seconds)
        videoTime = DURATION;
        showNaive = true;
        showBpp = true;
        bppCaptureProgress = 0;
        if (naiveContainer) naiveContainer.style.opacity = '1';
    }

    // Clamp video time
    videoTime = Math.max(0, Math.min(videoTime, DURATION));

    // Update sliders
    const isLightBg = true;  // Always light background
    updateTrajectorySlider(videoTime, isLightBg);
    updateAnimationControls(progress, isLightBg);

    // Draw overhead
    drawCachedFrame(overheadCtx, overheadFrameCache, videoTime, OVERHEAD_INTERVAL);

    // Show/hide strips
    if (naiveContainer) {
        naiveContainer.style.display = showNaive ? '' : 'none';
        if (showNaive && progress < 0.52) {
            naiveContainer.style.opacity = '1';
        }
        // Add dark background when BPP is visible (light background mode)
        naiveContainer.classList.toggle('dark-bg', showBpp);
        // Move naive to bottom when BPP is visible
        naiveContainer.classList.toggle('bottom', showBpp);
    }
    if (bppContainer) {
        // Use class toggle for smooth CSS transition instead of display
        bppContainer.classList.toggle('visible', showBpp);
    }

    // Render frames
    if (showNaive) {
        // Show failure highlight during msg2 reading phase
        // Segment E: 0.38-0.52, reading phase is 0.394-0.499, show highlight during middle
        const showFailureHighlight = progress >= 0.41 && progress < 0.48;
        renderNaiveFrames(videoTime, showFailureHighlight);
    }
    if (showBpp) {
        renderBppFrames(videoTime, bppCaptureProgress);
    }
}

// ============================================
// 8. Animation Loop & Controls
// ============================================

function animationLoop(currentTime) {
    if (!isPlaying) {
        lastFrameTime = null;
        return;
    }

    if (lastFrameTime === null) {
        lastFrameTime = currentTime;
    }

    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;

    // Update progress
    animationProgress += deltaTime / ANIMATION_DURATION;

    // Loop when finished
    if (animationProgress >= 1) {
        animationProgress = 0;
        // Reset baselines for smooth looping
        resetNaiveRowBaseline();
        resetFrameStripsBaseline();
    }

    updateAnimation(animationProgress);
    requestAnimationFrame(animationLoop);
}

function play() {
    if (isPlaying) return;
    isPlaying = true;
    lastFrameTime = null;
    if (playPauseBtn) playPauseBtn.classList.add('playing');
    requestAnimationFrame(animationLoop);
}

function pause() {
    isPlaying = false;
    if (playPauseBtn) playPauseBtn.classList.remove('playing');
}

function togglePlayPause() {
    if (isPlaying) {
        pause();
    } else {
        play();
    }
}

function seekToProgress(progress) {
    animationProgress = Math.max(0, Math.min(1, progress));
    // Reset baselines when seeking
    resetNaiveRowBaseline();
    resetFrameStripsBaseline();
    updateAnimation(animationProgress);
}

function handleSliderInteraction(event) {
    if (!animationSliderTrack) return;

    const rect = animationSliderTrack.getBoundingClientRect();
    const x = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));

    seekToProgress(progress);
}

function startDrag(event) {
    isDragging = true;
    pause(); // Pause while dragging
    handleSliderInteraction(event);
    event.preventDefault();
}

function doDrag(event) {
    if (!isDragging) return;
    handleSliderInteraction(event);
    event.preventDefault();
}

function endDrag() {
    if (!isDragging) return;
    isDragging = false;
}

function initAnimationControls() {
    // Play/Pause button
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }

    // Slider interactions
    if (animationSliderTrack) {
        // Mouse events
        animationSliderTrack.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);

        // Touch events
        animationSliderTrack.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', doDrag, { passive: false });
        document.addEventListener('touchend', endDrag);
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        // Only respond if the animation section is visible
        if (!scrollSection) return;
        const rect = scrollSection.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (!isVisible) return;

        if (e.code === 'Space') {
            togglePlayPause();
            e.preventDefault();
        } else if (e.code === 'ArrowLeft') {
            seekToProgress(animationProgress - 0.02);
            e.preventDefault();
        } else if (e.code === 'ArrowRight') {
            seekToProgress(animationProgress + 0.02);
            e.preventDefault();
        }
    });
}

// Auto-play when section becomes visible
function initVisibilityObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
                // Auto-play when section becomes visible
                if (cacheReady && !isPlaying) {
                    play();
                }
            } else if (!entry.isIntersecting || entry.intersectionRatio < 0.1) {
                // Pause when section leaves viewport
                pause();
            }
        });
    }, { threshold: [0.1, 0.3] });

    if (scrollSection) {
        observer.observe(scrollSection);
    }
}

// ============================================
// 9. Video Autoplay Observers
// ============================================
function initVideoAutoplay() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.autoplay-video').forEach(video => {
        observer.observe(video);
    });
}

// ============================================
// 10. Citation Copy
// ============================================
function copyCitation(button) {
    const codeBlock = button.parentElement.querySelector('code');
    const text = codeBlock.textContent;

    navigator.clipboard.writeText(text).then(() => {
        const originalHTML = button.innerHTML;
        button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Copied!
        `;
        button.style.background = '#16a34a';
        button.style.borderColor = '#16a34a';
        button.style.color = '#fff';

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.background = '';
            button.style.borderColor = '';
            button.style.color = '';
        }, 2000);
    });
}

window.copyCitation = copyCitation;

// ============================================
// 11. Smooth Scroll for Anchor Links
// ============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ============================================
// 12. Fade-in on Scroll
// ============================================
function initFadeIn() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });
}

// ============================================
// 13. Initialize Everything
// ============================================
async function init() {
    // Get DOM references
    scrollSection = document.getElementById('scroll-demo');
    if (!scrollSection) return;

    scrollContainer = scrollSection.querySelector('.scroll-container');
    scrollSticky = scrollSection.querySelector('.scroll-sticky');
    overheadCanvas = document.getElementById('scrollOverheadCanvas');
    overheadCtx = overheadCanvas.getContext('2d');
    overheadCanvas.width = OVERHEAD_W;
    overheadCanvas.height = OVERHEAD_H;
    overheadWrap = document.querySelector('.scroll-overhead-wrap');

    naiveSlots = createSlots('scrollNaiveStrip', TOTAL_SLOTS);
    bppSlots = createSlots('scrollBppStrip', TOTAL_SLOTS);

    naiveContainer = document.getElementById('scrollNaiveContainer');
    bppContainer = document.getElementById('scrollBppContainer');
    frameStripsWrapper = document.getElementById('frameStripsWrapper');
    msg1 = document.getElementById('scrollMsg1');
    msg2 = document.getElementById('scrollMsg2');
    msg3 = document.getElementById('scrollMsg3');
    msg4 = document.getElementById('scrollMsg4');
    bppTitle = document.getElementById('scrollBppTitle');
    scrollSectionHeader = document.getElementById('scrollSectionHeader');
    policyInputHighlight = document.getElementById('policyInputHighlight');
    trajectorySliderContainer = document.getElementById('trajectorySliderContainer');
    trajectorySliderProgress = document.getElementById('trajectorySliderProgress');
    trajectorySliderThumb = document.getElementById('trajectorySliderThumb');
    animationControls = document.getElementById('animationControls');
    playPauseBtn = document.getElementById('playPauseBtn');
    animationSliderTrack = document.getElementById('animationSliderTrack');
    animationSliderProgress = document.getElementById('animationSliderProgress');
    animationSliderThumb = document.getElementById('animationSliderThumb');

    // Load pre-extracted frame images
    await loadFrameImages();

    // Show controls after loading
    if (trajectorySliderContainer) {
        trajectorySliderContainer.classList.add('visible');
    }
    if (animationControls) {
        animationControls.classList.add('visible');
    }

    // Initialize animation controls
    initAnimationControls();

    // Initial render
    updateAnimation(0);

    // Set up auto-play on visibility
    initVisibilityObserver();
}

// Randomize senior author order (Aviral Kumar and Dhruv Shah)
function randomizeSeniorAuthors() {
    const authorList = document.getElementById('authorList');
    const senior1 = document.getElementById('seniorAuthor1');
    const senior2 = document.getElementById('seniorAuthor2');

    if (authorList && senior1 && senior2 && Math.random() < 0.5) {
        // Swap the order: move senior2 before senior1
        authorList.insertBefore(senior2, senior1);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    randomizeSeniorAuthors();
    initSmoothScroll();
    initFadeIn();
    initVideoAutoplay();
    init();
    initInteractiveCharts();
});

// ============================================
// 14. Interactive Bar Charts (Chart.js)
// ============================================

// Actual data extracted from experiments
const SIM_RESULTS_DATA = {
    "Variable Password Entering": {
        "Current Obs": { mean: 57.5, sem: 2.0 },
        "Naive History": { mean: 81.4, sem: 2.6 },
        "PTP": { mean: 88.3, sem: 4.3 },
        "BPP (Ours)": { mean: 97.7, sem: 0.5 },
        "Oracle": { mean: 87.5, sem: 1.5 }
    },
    "Fixed Password Entering": {
        "Current Obs": { mean: 38.2, sem: 3.3 },
        "Naive History": { mean: 55.5, sem: 3.3 },
        "PTP": { mean: 60.4, sem: 5.5 },
        "BPP (Ours)": { mean: 63.2, sem: 4.1 },
        "Oracle": { mean: 78.8, sem: 8.7 }
    },
    "Ingredient Insertion": {
        "Current Obs": { mean: 23.8, sem: 3.5 },
        "Naive History": { mean: 16.4, sem: 4.1 },
        "PTP": { mean: 3.8, sem: 1.5 },
        "BPP (Ours)": { mean: 30.0, sem: 6.0 },
        "Oracle": { mean: 52.5, sem: 4.2 }
    }
};

const METHOD_COLORS = {
    "Current Obs": "#DDDDDD",
    "Naive History": "#EE8866",
    "PTP": "#EEDD88",
    "BPP (Ours)": "#77AADD",
    "Oracle": "#44BB99"
};

const METHOD_ORDER = ["Current Obs", "Naive History", "PTP", "BPP (Ours)", "Oracle"];
const TASK_ORDER = ["Variable Password Entering", "Fixed Password Entering", "Ingredient Insertion"];

function initInteractiveCharts() {
    const canvas = document.getElementById('simResultsChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Calculate averages
    const averages = {};
    METHOD_ORDER.forEach(method => {
        const values = TASK_ORDER.map(task => SIM_RESULTS_DATA[task][method].mean);
        averages[method] = {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            sem: 0 // No error bar for average
        };
    });

    // Prepare datasets for Chart.js
    const datasets = METHOD_ORDER.map(method => {
        const data = [];
        const errorBars = [];

        // Add task data
        TASK_ORDER.forEach(task => {
            data.push(SIM_RESULTS_DATA[task][method].mean);
            errorBars.push(SIM_RESULTS_DATA[task][method].sem);
        });

        // Add average
        data.push(averages[method].mean);
        errorBars.push(0);

        return {
            label: method,
            data: data,
            backgroundColor: METHOD_COLORS[method],
            borderColor: 'transparent',
            borderWidth: 0,
            errorBars: errorBars,
            barPercentage: 1.0,
            categoryPercentage: 0.85
        };
    });

    // Labels for x-axis
    const labels = [...TASK_ORDER, 'Average'];

    // Custom plugin for bar borders (overlapping at intersections, handling height differences)
    const barBorderPlugin = {
        id: 'barBorders',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            const numDatasets = data.datasets.length;

            // For each category (task), collect all bar info
            const numCategories = data.labels.length;

            for (let catIndex = 0; catIndex < numCategories; catIndex++) {
                // Collect bar data for this category across all datasets
                const bars = [];
                for (let dsIndex = 0; dsIndex < numDatasets; dsIndex++) {
                    const meta = chart.getDatasetMeta(dsIndex);
                    if (meta.hidden) continue;
                    const bar = meta.data[catIndex];
                    bars.push({
                        dsIndex,
                        x: bar.x,
                        y: bar.y,  // top of bar (smaller y = higher)
                        width: bar.width,
                        base: bar.base  // bottom of bar
                    });
                }

                ctx.save();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
                ctx.lineWidth = 2;
                ctx.lineCap = 'square';

                bars.forEach((bar, i) => {
                    const halfWidth = bar.width / 2;
                    const left = bar.x - halfWidth;
                    const right = bar.x + halfWidth;
                    const top = bar.y;
                    const bottom = bar.base;

                    const prevBar = i > 0 ? bars[i - 1] : null;
                    const nextBar = i < bars.length - 1 ? bars[i + 1] : null;

                    // Draw top border
                    ctx.beginPath();
                    ctx.moveTo(left, top);
                    ctx.lineTo(right, top);
                    ctx.stroke();

                    // Draw left border
                    if (i === 0) {
                        // First bar: full left border
                        ctx.beginPath();
                        ctx.moveTo(left, top);
                        ctx.lineTo(left, bottom);
                        ctx.stroke();
                    } else if (prevBar && top < prevBar.y) {
                        // Current bar is taller than previous: draw exposed left segment
                        ctx.beginPath();
                        ctx.moveTo(left, top);
                        ctx.lineTo(left, prevBar.y);
                        ctx.stroke();
                    }

                    // Draw right border
                    if (i === bars.length - 1) {
                        // Last bar: full right border
                        ctx.beginPath();
                        ctx.moveTo(right, top);
                        ctx.lineTo(right, bottom);
                        ctx.stroke();
                    } else {
                        // Draw shared border (from bottom to the higher of the two tops)
                        const sharedTop = Math.max(top, nextBar.y);  // max because y increases downward
                        ctx.beginPath();
                        ctx.moveTo(right, sharedTop);
                        ctx.lineTo(right, bottom);
                        ctx.stroke();

                        // If current bar is taller than next, draw exposed right segment
                        if (top < nextBar.y) {
                            ctx.beginPath();
                            ctx.moveTo(right, top);
                            ctx.lineTo(right, nextBar.y);
                            ctx.stroke();
                        }
                    }
                });

                ctx.restore();
            }
        }
    };

    // Custom plugin for error bars (centered on top of bar)
    const errorBarPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
            const { ctx, data, scales } = chart;

            data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (!meta.hidden && dataset.errorBars) {
                    meta.data.forEach((bar, index) => {
                        const errorValue = dataset.errorBars[index];
                        if (errorValue > 0) {
                            const x = bar.x;
                            const yTop = bar.y; // Top of the bar
                            const dataValue = dataset.data[index];

                            // Calculate pixel positions for error bar ends
                            const yErrorTop = scales.y.getPixelForValue(dataValue + errorValue);
                            const yErrorBottom = scales.y.getPixelForValue(dataValue - errorValue);

                            ctx.save();
                            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
                            ctx.lineWidth = 1.5;

                            // Vertical line (full error bar centered on bar top)
                            ctx.beginPath();
                            ctx.moveTo(x, yErrorTop);
                            ctx.lineTo(x, yErrorBottom);
                            ctx.stroke();

                            // Top cap
                            ctx.beginPath();
                            ctx.moveTo(x - 4, yErrorTop);
                            ctx.lineTo(x + 4, yErrorTop);
                            ctx.stroke();

                            // Bottom cap
                            ctx.beginPath();
                            ctx.moveTo(x - 4, yErrorBottom);
                            ctx.lineTo(x + 4, yErrorBottom);
                            ctx.stroke();

                            ctx.restore();
                        }
                    });
                }
            });
        }
    };

    // Custom plugin for separator line before Average
    const separatorPlugin = {
        id: 'separator',
        afterDraw(chart) {
            const { ctx, scales, chartArea } = chart;
            const xScale = scales.x;

            // Get position between Ingredient Insertion and Average
            const lastTaskIndex = TASK_ORDER.length - 1;
            const avgIndex = TASK_ORDER.length;

            // Calculate x position (midpoint between last task group and average group)
            const lastTaskX = xScale.getPixelForValue(lastTaskIndex);
            const avgX = xScale.getPixelForValue(avgIndex);
            const separatorX = (lastTaskX + avgX) / 2;

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            ctx.moveTo(separatorX, chartArea.top);
            ctx.lineTo(separatorX, chartArea.bottom);
            ctx.stroke();

            ctx.restore();
        }
    };

    // Create the chart
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            layout: {
                padding: {
                    top: 20,
                    bottom: 10
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12,
                            weight: function(context) {
                                return context.tick.label === 'Average' ? 'bold' : 'normal';
                            }
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Normalized Score (%)',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rect',
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const datasetIndex = context.datasetIndex;
                            const dataIndex = context.dataIndex;
                            const value = context.parsed.y;
                            const sem = datasets[datasetIndex].errorBars[dataIndex];

                            if (sem > 0) {
                                return `${context.dataset.label}: ${value.toFixed(1)}% ± ${sem.toFixed(1)}%`;
                            }
                            return `${context.dataset.label}: ${value.toFixed(1)}%`;
                        }
                    }
                }
            },
            interaction: {
                intersect: true,
                mode: 'nearest'
            }
        },
        plugins: [barBorderPlugin, errorBarPlugin, separatorPlugin]
    });
}
