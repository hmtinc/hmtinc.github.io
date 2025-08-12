// ==UserScript==
// @name         AMC Replay
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Extract AMC data and show analytics with export options
// @author       Harsh M
// @match        https://www.amctheatres.com/my-amc/history*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const orders = [];
    let isProcessing = false;

    function showProgress(message, current = 0, total = 0) {
        let overlay = document.getElementById('amc-progress-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'amc-progress-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.8); z-index: 99999; display: flex; 
                align-items: center; justify-content: center; font-family: Arial;
            `;
            overlay.innerHTML = `
                <div style="background: white; padding: 2rem; border-radius: 10px; text-align: center; min-width: 300px;">
                    <h2 style="color: #ff0000; margin: 0 0 1rem 0;">🎬 Processing AMC Replay</h2>
                    <div id="progress-message" style="color: #333; margin-bottom: 1rem;"></div>
                    <div style="background: #f0f0f0; border-radius: 10px; height: 20px; overflow: hidden; margin-bottom: 1rem;">
                        <div id="progress-bar" style="background: #ff0000; height: 100%; width: 0%; transition: width 0.3s;"></div>
                    </div>
                    <div id="progress-stats" style="color: #666; font-size: 0.9rem;"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        document.getElementById('progress-message').textContent = message;
        if (total > 0) {
            const percent = (current / total) * 100;
            document.getElementById('progress-bar').style.width = percent + '%';
            document.getElementById('progress-stats').textContent = `${current} / ${total} (${percent.toFixed(1)}%)`;
        }
    }

    function hideProgress() {
        const overlay = document.getElementById('amc-progress-overlay');
        if (overlay) overlay.remove();
    }

    function addButton() {
        // Only add button on the history page
        if (!window.location.href.includes('/my-amc/history')) return;
        
        const nav = document.querySelector('header ul[aria-label="Site Sections"]');
        if (nav) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.innerHTML = '🎬 AMC Replay';
            btn.style.cssText = 'padding:8px 16px;background:#ff0000;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;';
            btn.onclick = startProcess;
            li.appendChild(btn);
            nav.appendChild(li);
        }
    }

    function getDateFromHeader(accordion) {
        // Look for h2 in parent containers
        let current = accordion.parentElement;
        while (current) {
            const h2 = current.querySelector('h2');
            if (h2 && h2.textContent.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
                return h2.textContent.trim();
            }
            current = current.previousElementSibling;
        }
        
        // Fallback: look in previous siblings
        current = accordion;
        while (current && current.previousElementSibling) {
            current = current.previousElementSibling;
            const h2 = current.querySelector('h2');
            if (h2 && h2.textContent.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
                return h2.textContent.trim();
            }
        }
        return '';
    }

    function extractData(accordion) {
        const trigger = accordion.querySelector('.accordion__trigger');
        const content = accordion.querySelector('.accordion__content');
        
        if (!trigger || !content) return null;

        const title = trigger.querySelector('h3')?.textContent?.trim() || '';
        const confirmationEl = Array.from(trigger.querySelectorAll('h3')).find(h3 => h3.textContent.includes('Ticket Confirmation'));
        const confirmation = confirmationEl?.textContent?.match(/(\d+)/)?.[1] || '';
        
        const spans = trigger.querySelectorAll('span');
        const totalCost = Array.from(spans).pop()?.textContent?.match(/\$[\d.]+/)?.[0] || '$0.00';

        if (title.includes('AMC A-List Monthly')) {
            return { type: 'subscription', title, totalCost, date: getDateFromHeader(accordion) };
        }

        let date = getDateFromHeader(accordion);
        let time = '';
        let theatre = '';
        let auditorium = '';
        let seats = '';
        let originalPrice = '$0.00';

        const contentText = content.textContent;
        
        const dateMatch = contentText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+\s+\d+)/);
        if (dateMatch) {
            const yearMatch = contentText.match(/\b(202[2-5])\b/);
            if (yearMatch) {
                date = `${dateMatch[1]}, ${dateMatch[2]}, ${yearMatch[1]}`;
            }
        }
        
        const timeMatch = contentText.match(/at (\d+:\d+[ap]m)/i);
        time = timeMatch?.[1] || '';

        const theatreMatch = contentText.match(/AMC [A-Za-z0-9\s]+?\d+/);
        theatre = theatreMatch?.[0] || '';

        const sections = content.querySelectorAll('div');
        sections.forEach(section => {
            const text = section.textContent.toUpperCase();
            if (text.includes('AUDITORIUM')) {
                const audMatch = text.match(/AUDITORIUM\s*(\d+)/);
                auditorium = audMatch?.[1] || '';
            }
            if (text.includes('SEATS')) {
                const seatMatch = text.match(/SEATS\s*([A-Z0-9,\s]+)/);
                seats = seatMatch?.[1]?.trim() || '';
            }
        });

        const priceMatches = contentText.match(/\$\d+\.\d+/g) || [];
        originalPrice = priceMatches.find(price => price !== '$0.00' && price !== totalCost) || '$0.00';

        const isRefunded = contentText.includes('REFUND') || content.querySelector('.text-green-500');

        return {
            type: 'movie',
            title,
            date,
            time,
            theatre,
            auditorium,
            seats,
            confirmation,
            totalCost,
            originalPrice,
            isRefunded: !!isRefunded,
            status: 'valid'
        };
    }

    async function processPage(pageNum) {
        const accordions = document.querySelectorAll('[data-orientation="vertical"]');
        showProgress(`Processing page ${pageNum}...`, 0, accordions.length);
        
        for (let i = 0; i < accordions.length; i++) {
            const accordion = accordions[i];
            const trigger = accordion.querySelector('.accordion__trigger');
            if (trigger) {
                showProgress(`Processing page ${pageNum}: ${trigger.querySelector('h3')?.textContent?.substring(0, 30) || 'Item'}...`, i + 1, accordions.length);
                
                trigger.click();
                await new Promise(r => setTimeout(r, 500));
                
                const data = extractData(accordion);
                if (data) orders.push(data);
                
                trigger.click();
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }

    async function nextPage() {
        const nextBtn = document.querySelector('button[data-page="after"]:not([disabled])');
        if (nextBtn) {
            showProgress('Loading next page...');
            nextBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            return true;
        }
        return false;
    }

    async function startProcess() {
        if (isProcessing) return;
        isProcessing = true;
        orders.length = 0;
        let pageNum = 1;

        try {
            showProgress('Starting extraction...');
            
            do {
                await processPage(pageNum);
                pageNum++;
            } while (await nextPage());
            
            showProgress('Generating dashboard...');
            await new Promise(r => setTimeout(r, 500));
            
            hideProgress();
            markCancelledDuplicates();
            showDashboard();
        } catch (e) {
            hideProgress();
            alert('Error: ' + e.message);
            console.error(e);
        }
        
        isProcessing = false;
    }

    function markCancelledDuplicates() {
        const movieOrders = orders.filter(o => o.type === 'movie');
        
        for (let i = 0; i < movieOrders.length; i++) {
            const current = movieOrders[i];
            const currentDate = new Date(current.date);
            
            for (let j = i + 1; j < movieOrders.length; j++) {
                const other = movieOrders[j];
                const otherDate = new Date(other.date);
                const daysDiff = Math.abs((currentDate - otherDate) / (1000 * 60 * 60 * 24));
                
                if (current.title === other.title && daysDiff <= 3) {
                    if (currentDate > otherDate) {
                        other.status = 'cancelled';
                    } else {
                        current.status = 'cancelled';
                    }
                }
            }
        }
    }

    function exportCSV() {
        const allMovies = orders.filter(o => o.type === 'movie');
        const csv = [
            'Date,Movie,Theatre,Time,Seats,Confirmation,Original Price,Status',
            ...allMovies.map(m => `"${m.date}","${m.title}","${m.theatre}","${m.time}","${m.seats}","${m.confirmation}","${m.originalPrice}","${m.status}"`)
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'amc-replay-data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportPNG() {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
            // Find the dashboard window
            const dashboardWindow = Array.from(window.open('', '_self').window.parent.frames).find(frame => 
                frame.document.title.includes('AMC Replay Dashboard')
            ) || window;
            
            html2canvas(dashboardWindow.document.body, { useCORS: true, scale: 1 }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'amc-replay-dashboard.png';
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        };
        document.head.appendChild(script);
    }

    function showDashboard() {
        const validMovies = orders.filter(o => o.type === 'movie' && o.status === 'valid');
        const subscriptions = orders.filter(o => o.type === 'subscription');
        
        // Store export functions globally
        window.exportCSV = exportCSV;
        window.exportPNG = () => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => {
                html2canvas(document.body, { useCORS: true, scale: 1 }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = 'amc-replay-dashboard.png';
                    link.href = canvas.toDataURL('image/png');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
            };
            document.head.appendChild(script);
        };
        
        const monthlyData = {};
        orders.filter(o => o.type === 'movie').forEach(movie => {
            // Parse dates like "Sep 9, 2024" or "September 9, 2024"
            const dateMatch = movie.date.match(/([A-Za-z]+)\s+\d+,\s+(202[2-5])/);
            if (dateMatch) {
                const monthAbbr = dateMatch[1];
                const year = dateMatch[2];
                
                // Convert abbreviated month to full month name
                const monthMap = {
                    'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
                    'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
                    'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
                };
                const month = monthMap[monthAbbr] || monthAbbr;
                const monthYear = `${month} ${year}`;
                
                if (!monthlyData[monthYear]) {
                    monthlyData[monthYear] = { movies: [], spent: 27.99, saved: 0 };
                }
                monthlyData[monthYear].movies.push(movie);
                if (movie.status === 'valid') {
                    monthlyData[monthYear].saved += parseFloat(movie.originalPrice.replace('$', '')) || 0;
                }
            }
        });

        const totalSpent = Object.keys(monthlyData).length * 27.99;
        const totalSaved = Object.values(monthlyData).reduce((sum, m) => sum + m.saved, 0) - totalSpent;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>🎬 AMC Replay Dashboard</title>
            <link rel="icon" href="https://www.amctheatres.com/favicon.ico">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    background-image: url('https://images.unsplash.com/photo-1519681393784-d120267933ba?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1124&q=100');
                    background-position: center;
                    background-size: cover;
                    background-attachment: fixed;
                    min-height: 100vh; padding: 20px; color: white;
                }
                .glass { 
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    background-color: rgba(17, 25, 40, 0.75);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.125);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }
                .header { 
                    backdrop-filter: blur(20px) saturate(200%);
                    -webkit-backdrop-filter: blur(20px) saturate(200%);
                    background-color: rgba(220, 53, 69, 0.8);
                    padding: 3rem; text-align: center; margin-bottom: 2rem; 
                    border-radius: 25px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 12px 40px rgba(220, 53, 69, 0.4);
                }
                .header h1 { font-size: 3.5rem; font-weight: 700; margin-bottom: 0.5rem; text-shadow: 0 4px 8px rgba(0,0,0,0.3); }
                .export-buttons { text-align: center; margin-bottom: 2rem; }
                .export-btn { 
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    background-color: rgba(76, 175, 80, 0.8);
                    color: white; border: none; padding: 15px 30px; margin: 0 15px; 
                    border-radius: 50px; cursor: pointer; font-weight: 600; font-size: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 8px 25px rgba(76, 175, 80, 0.3); transition: all 0.3s ease;
                }
                .export-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 35px rgba(76, 175, 80, 0.5); }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 2rem; }
                .stat { padding: 2rem; text-align: center; transition: transform 0.3s ease; }
                .stat:hover { transform: translateY(-5px); }
                .stat-value { font-size: 3rem; font-weight: 700; background: linear-gradient(135deg, #ff6b6b, #ff8e8e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .stat-label { opacity: 0.9; margin-top: 0.5rem; font-weight: 500; }
                .months { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem; }
                .month { padding: 2rem; border-left: 5px solid #ff6b6b; transition: transform 0.3s ease; }
                .month:hover { transform: translateY(-3px); }
                .month h3 { color: #ff6b6b; margin-bottom: 1rem; font-size: 1.5rem; }
                .movie { padding: 1rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .movie.cancelled { opacity: 0.6; }
                .movie-title { font-weight: 600; margin-bottom: 0.3rem; }
                .movie-theatre { font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.5rem; }
                .movie-bottom { display: flex; justify-content: space-between; align-items: center; }
                .movie-status { font-size: 0.8rem; padding: 4px 12px; border-radius: 15px; font-weight: 600; }
                .status-valid { background: rgba(76, 175, 80, 0.3); }
                .status-cancelled { background: rgba(244, 67, 54, 0.3); }
                .savings { 
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    background-color: rgba(76, 175, 80, 0.8);
                    padding: 2rem; text-align: center; font-size: 1.3rem; margin: 2rem 0; 
                    border-radius: 20px; font-weight: 600;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
                }
            </style>
        </head>
        <body>
            <div class="header glass">
                <h1>🎬 AMC Replay Dashboard</h1>
                <p style="font-size: 1.2rem; opacity: 0.9;">Your Complete Movie Journey</p>
            </div>
            
            <div class="export-buttons">
                <button class="export-btn" onclick="window.opener.exportCSV()">📊 Export CSV</button>
                <button class="export-btn" onclick="
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    script.onload = () => {
                        html2canvas(document.body, { useCORS: true, scale: 1 }).then(canvas => {
                            const link = document.createElement('a');
                            link.download = 'amc-replay-dashboard.png';
                            link.href = canvas.toDataURL('image/png');
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        });
                    };
                    document.head.appendChild(script);
                ">📸 Export PNG</button>
            </div>
            
            <div class="savings glass">
                🎉 You saved $${totalSaved.toFixed(2)} with A-List on ${validMovies.length} movies!
            </div>
            
            <div class="stats">
                <div class="stat glass">
                    <div class="stat-value">${validMovies.length}</div>
                    <div class="stat-label">Valid Movies</div>
                </div>
                <div class="stat glass">
                    <div class="stat-value">${orders.filter(o => o.type === 'movie').length}</div>
                    <div class="stat-label">Total Bookings</div>
                </div>
                <div class="stat glass">
                    <div class="stat-value">$${totalSpent.toFixed(2)}</div>
                    <div class="stat-label">Spent</div>
                </div>
                <div class="stat glass">
                    <div class="stat-value">$${totalSaved.toFixed(2)}</div>
                    <div class="stat-label">Saved</div>
                </div>
            </div>
            
            <div class="months">
                ${Object.entries(monthlyData).map(([monthYear, data]) => 
                    '<div class="month glass">' +
                        '<h3>' + monthYear + '</h3>' +
                        '<p style="margin-bottom: 1rem;"><strong>' + data.movies.filter(m => m.status === 'valid').length + ' valid movies</strong> • Saved: $' + (data.saved - 27.99).toFixed(2) + '</p>' +
                        data.movies.map(m => 
                            '<div class="movie ' + (m.status === 'cancelled' ? 'cancelled' : '') + '">' +
                                '<div class="movie-title">' + m.title + '</div>' +
                                '<div class="movie-theatre">' + (m.theatre || 'Theatre not specified') + '</div>' +
                                '<div class="movie-bottom">' +
                                    '<span>' + m.originalPrice + '</span>' +
                                    '<span class="movie-status status-' + m.status + '">' + (m.status === 'valid' ? 'Watched' : 'Cancelled') + '</span>' +
                                '</div>' +
                            '</div>'
                        ).join('') +
                    '</div>'
                ).join('')}
            </div>
        </body>
        </html>`;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addButton);
    } else {
        addButton();
    }

})();
