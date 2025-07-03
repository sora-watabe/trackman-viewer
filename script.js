document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFileInput');
    const outputDiv = document.getElementById('output');
    const modal = document.getElementById('pitch-details-modal');
    const closeModalButton = document.querySelector('.close-button');
    const teamStatsNavigation = document.getElementById('team-stats-navigation');
    let fullGameData = [];

    // On page load, check if data exists in sessionStorage
    const storedData = sessionStorage.getItem('trackmanData');
    if (storedData) {
        try {
            fullGameData = JSON.parse(storedData);
            if (fullGameData && fullGameData.length > 0) {
                displayData(fullGameData);
            }
        } catch (e) {
            console.error("Error parsing data from sessionStorage:", e);
            sessionStorage.removeItem('trackmanData'); // Clear corrupted data
        }
    }

    csvFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            parseCsv(file);
        }
    });

    closeModalButton.onclick = () => modal.style.display = "none";
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    function parseCsv(file) {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            complete: function(results) {
                let data = results.data.filter(row => row.Pitcher && row.Batter);
                
                // Add a unique PA identifier to each pitch before saving
                let paCount = 0;
                if (data.length > 0) {
                    data.forEach(row => {
                        if (row.PitchofPA === 1) {
                            paCount++;
                        }
                        row.paCount = paCount;
                    });
                }

                fullGameData = data;
                sessionStorage.setItem('trackmanData', JSON.stringify(fullGameData)); // Save to sessionStorage with paCount
                outputDiv.innerHTML = '';
                displayData(fullGameData);
            },
            error: function(error) {
                console.error("Error parsing CSV:", error);
                outputDiv.innerHTML = `<p style="color: red;">Error parsing CSV file: ${error.message}</p>`;
            }
        });
    }

    function displayData(data) {
        if (!data || data.length === 0) {
            outputDiv.innerHTML = '<p>No data to display.</p>';
            return;
        }
        outputDiv.style.display = 'none';
        const gameData = processGameData(data);
        displayScoreboard(gameData.scoreboard);
        displayInningScores(gameData.inningScores);
        displayAtBatResults(gameData.atBatResults);
        createTeamStatsButtons(gameData.scoreboard.homeTeamName, gameData.scoreboard.awayTeamName);
    }

    // 打席が継続するかどうかを判定
    function shouldContinueAtBat(row) {
        const continuingPlays = [
            'CaughtStealing',  // 盗塁死
            'StolenBase',      // 盗塁成功
            'WildPitch',       // 暴投
            'PassedBall',      // 捕逸
            'Balk'             // ボーク
        ];
        
        return row.PlayResult && continuingPlays.includes(row.PlayResult);
    }

    // 打席結果が確定したかを判定
    function isBatterResultFinalized(row) {
        // 打席が継続する場合はfalse
        if (shouldContinueAtBat(row)) {
            return false;
        }
        
        // 通常の打席終了条件
        const finalizedResults = [
            'Single', 'Double', 'Triple', 'HomeRun',
            'Out', 'Sacrifice', 'Error', 'FieldersChoice'
        ];
        
        if (row.PlayResult && finalizedResults.includes(row.PlayResult)) {
            return true;
        }
        
        if (row.KorBB === 'Walk' || row.KorBB === 'Strikeout') {
            return true;
        }
        
        if (row.PitchCall === 'HitByPitch') {
            return true;
        }
        
        return false;
    }

    // 行データから結果を抽出
    function extractResultFromRow(row) {
        return {
            playResult: row.PlayResult,
            taggedHitType: row.TaggedHitType,
            korBB: row.KorBB,
            pitcher: row.Pitcher,
            batterName: row.Batter,
            pitchCall: row.PitchCall,
            paCount: row.paCount
        };
    }

    function processGameData(data) {
        if (!data || data.length === 0) {
            return { scoreboard: {}, inningScores: {}, atBatResults: {} };
        }

        const homeTeam = data[0].HomeTeam;
        const awayTeam = data[0].AwayTeam;
        let homeScore = 0, awayScore = 0;
        const inningScores = { [homeTeam]: {}, [awayTeam]: {} };
        const atBatResults = { [homeTeam]: [], [awayTeam]: [] };
        const lineups = { [homeTeam]: [], [awayTeam]: [] };
        const uniqueBatters = { [homeTeam]: new Set(), [awayTeam]: new Set() };

        // 初期ラインナップの構築（最初の9人）
        for (const row of data) {
            if (!row.BatterId || !row.Batter) continue;
            const team = row['Top/Bottom'] === 'Top' ? awayTeam : homeTeam;
            if (lineups[team].length < 9 && !uniqueBatters[team].has(row.BatterId)) {
                lineups[team].push({ id: row.BatterId, name: row.Batter, results: {} });
                uniqueBatters[team].add(row.BatterId);
            }
        }
        
        // 9人に満たない場合は埋める
        for(const team in lineups){
            while(lineups[team].length < 9){
                lineups[team].push({id: `unknown_${team}_${lineups[team].length}`, name: `Player ${lineups[team].length + 1}`, results: {}});
            }
        }

        atBatResults[homeTeam] = JSON.parse(JSON.stringify(lineups[homeTeam]));
        atBatResults[awayTeam] = JSON.parse(JSON.stringify(lineups[awayTeam]));

        // 各チームの実際の打席カウンター（完了した打席のみカウント）
        const actualAtBatCount = { [homeTeam]: 0, [awayTeam]: 0 };
        
        // 現在処理中の打席情報
        let currentPA = null;
        let previousRow = null;
        
        data.forEach((row, index) => {
            if (!row.Inning || !row.BatterId) return;
            const team = row['Top/Bottom'] === 'Top' ? awayTeam : homeTeam;

            // 新しい打席の開始
            if (row.PitchofPA === 1) {
                // 前の打席を完了させる（申告敬遠チェック）
                if (currentPA && !currentPA.finalized) {
                    // 同じイニング、同じチームで打者が変わった場合は申告敬遠
                    if (currentPA.team === team && 
                        currentPA.inning === row.Inning && 
                        currentPA.batterId !== row.BatterId) {
                        
                        // 申告敬遠として記録
                        const battingOrderIndex = actualAtBatCount[team] % 9;
                        const batterSlot = atBatResults[team][battingOrderIndex];
                        
                        let targetBatter = null;
                        if (batterSlot.id === currentPA.batterId) {
                            targetBatter = batterSlot;
                        } else {
                            if (!batterSlot.substitutes) batterSlot.substitutes = [];
                            let sub = batterSlot.substitutes.find(s => s.id === currentPA.batterId);
                            if (!sub) {
                                sub = { id: currentPA.batterId, name: currentPA.batterName, results: {} };
                                batterSlot.substitutes.push(sub);
                            }
                            targetBatter = sub;
                        }
                        
                        if (targetBatter) {
                            const result = {
                                playResult: 'IntentionalWalk',
                                taggedHitType: undefined,
                                korBB: 'Walk',
                                pitcher: currentPA.pitcher,
                                batterName: currentPA.batterName,
                                pitchCall: 'IntentionalWalk',
                                paCount: currentPA.paCount
                            };
                            
                            if (!targetBatter.results[currentPA.inning]) {
                                targetBatter.results[currentPA.inning] = [];
                            }
                            targetBatter.results[currentPA.inning].push(result);
                        }
                        
                        actualAtBatCount[team]++;
                    }
                }
                
                // 新しい打席を開始
                currentPA = {
                    batterId: row.BatterId,
                    batterName: row.Batter,
                    team: team,
                    inning: row.Inning,
                    pitcher: row.Pitcher,
                    paCount: row.paCount,
                    finalized: false,
                    hasResult: false
                };
            }

            // 現在の打席の処理
            if (currentPA && currentPA.batterId === row.BatterId && !currentPA.finalized) {
                currentPA.pitcher = row.Pitcher;
                
                // 打席結果が確定したかチェック
                if (isBatterResultFinalized(row) && !shouldContinueAtBat(row)) {
                    const battingOrderIndex = actualAtBatCount[team] % 9;
                    const batterSlot = atBatResults[team][battingOrderIndex];
                    
                    let targetBatter = null;
                    if (batterSlot.id === row.BatterId) {
                        targetBatter = batterSlot;
                    } else {
                        if (!batterSlot.substitutes) batterSlot.substitutes = [];
                        let sub = batterSlot.substitutes.find(s => s.id === row.BatterId);
                        if (!sub) {
                            sub = { id: row.BatterId, name: row.Batter, results: {} };
                            batterSlot.substitutes.push(sub);
                        }
                        targetBatter = sub;
                    }
                    
                    if (targetBatter) {
                        const result = extractResultFromRow(row);
                        
                        if (!targetBatter.results[row.Inning]) {
                            targetBatter.results[row.Inning] = [];
                        }
                        targetBatter.results[row.Inning].push(result);
                    }
                    
                    currentPA.finalized = true;
                    actualAtBatCount[team]++;
                }
            }

            // 得点の処理
            if (row.RunsScored) {
                if (!inningScores[team][row.Inning]) inningScores[team][row.Inning] = 0;
                inningScores[team][row.Inning] += row.RunsScored;
                if (team === homeTeam) homeScore += row.RunsScored;
                else awayScore += row.RunsScored;
            }
            
            previousRow = row;
        });

        const gameDate = data[0].Date;
        const scoreboard = { [homeTeam]: homeScore, [awayTeam]: awayScore, homeTeamName: homeTeam, awayTeamName: awayTeam, gameDate: gameDate };
        return { scoreboard, inningScores, atBatResults };
    }

    function getResultHtml(atBat) {
        let resultText = 'N/A';
        let resultClass = '';
        const hits = ["Single", "Double", "Triple", "HomeRun"];

        if (atBat) {
            const playResult = atBat.playResult ? String(atBat.playResult).trim() : undefined;
            const taggedHitType = atBat.taggedHitType ? String(atBat.taggedHitType).trim() : undefined;
            const korBB = atBat.korBB && String(atBat.korBB).trim() !== 'Undefined' ? String(atBat.korBB).trim() : undefined;
            const pitchCall = atBat.pitchCall ? String(atBat.pitchCall).trim() : undefined;

            // 特殊なケースの処理
            const specialResults = {
                'IntentionalWalk': { text: '申告敬遠', class: 'walk' },
                'CaughtStealing': { text: '盗塁死', class: 'special-out' },
                'StolenBase': { text: '盗塁', class: 'special-play' },
                'WildPitch': { text: '暴投', class: 'special-play' },
                'PassedBall': { text: '捕逸', class: 'special-play' }
            };

            if (playResult && specialResults[playResult]) {
                resultText = specialResults[playResult].text;
                resultClass = specialResults[playResult].class;
            } else if (hits.includes(playResult)) {
                resultText = playResult;
                resultClass = 'hit';
            } else if (playResult === 'Out' || playResult === 'Sacrifice') {
                resultText = taggedHitType || playResult;
                resultClass = 'out';
            } else if (playResult === 'Error' || pitchCall === 'HitByPitch') {
                resultText = pitchCall === 'HitByPitch' ? 'HitByPitch' : playResult;
                resultClass = 'walk';
            } else if (playResult === 'Undefined' || playResult === undefined) {
                if (korBB === 'Walk') {
                    resultText = 'Walk';
                    resultClass = 'walk';
                } else if (korBB === 'Strikeout') {
                    resultText = 'Strikeout';
                    resultClass = 'out';
                }
            } else if (playResult) {
                resultText = playResult;
            }
        }
        
        const batterName = atBat && atBat.batterName ? atBat.batterName : '';
        const paCount = atBat && atBat.paCount ? atBat.paCount : 'null';
        return `<div class="result ${resultClass}" onclick="showPitchDetails(${paCount})">${resultText}</div><div class="pitcher-name">${batterName}</div>`;
    }

    window.showPitchDetails = (paCount) => {
        const pitches = fullGameData.filter(row => row.paCount === paCount);
        const modalHeader = document.getElementById('modal-header');
        const pitchListContainer = document.getElementById('at-bat-pitch-list');
        const chartContainer = document.getElementById('at-bat-pitch-chart');

        modalHeader.innerHTML = '';
        pitchListContainer.innerHTML = '';
        chartContainer.innerHTML = '';

        if (pitches.length === 0) {
            chartContainer.innerHTML = '<p>No pitch data available for this at-bat.</p>';
            modal.style.display = "block";
            return;
        }

        const firstPitch = pitches[0];
        modalHeader.innerHTML = `<h2>${firstPitch.Pitcher} vs. ${firstPitch.Batter}</h2>`;

        const list = document.createElement('ul');
        list.className = 'pitch-list';
        pitches.forEach((pitch, index) => {
            const item = document.createElement('li');
            item.textContent = `#${index + 1}: ${pitch.TaggedPitchType} - ${pitch.RelSpeed.toFixed(1)} km/h (${pitch.PitchCall})`;
            item.dataset.index = index;
            item.addEventListener('click', () => {
                document.querySelectorAll('#at-bat-pitch-list li').forEach(li => li.classList.remove('selected'));
                item.classList.add('selected');
                drawPitchChart(pitches, index);
            });
            list.appendChild(item);
        });
        pitchListContainer.appendChild(list);

        drawPitchChart(pitches);
        modal.style.display = "block";
    }

    function drawPitchChart(pitches, highlightedIndex = -1) {
        const chartContainer = document.getElementById('at-bat-pitch-chart');
        const traces = [];
        const pitchTypes = [...new Set(pitches.map(p => p.TaggedPitchType))];
        
        // カラーマップの定義
        const colorMap = {
            'Fastball': '#3a86ff',
            'Sinker': '#8338ec',
            'Cutter': '#ff006e',
            'Curveball': '#ffbe0b',
            'Slider': '#fb5607',
            'Changeup': '#06d6a0',
            'Splitter': '#118ab2',
            'Knuckleball': '#ef476f',
            'Undefined': '#adb5bd',
            'Other': '#495057'
        };

        pitchTypes.forEach(pitchType => {
            const typeData = pitches.filter(p => p.TaggedPitchType === pitchType);
            traces.push({
                x: typeData.map(d => d.PlateLocSide),
                y: typeData.map(d => d.PlateLocHeight),
                mode: 'markers',
                type: 'scatter',
                name: pitchType,
                hoverinfo: 'text',
                hovertemplate: '<b>%{text}</b><extra></extra>',
                text: typeData.map(d => `${d.TaggedPitchType}<br>${d.RelSpeed.toFixed(1)} km/h<br>PitchCall: ${d.PitchCall}`),
                marker: { 
                    size: 12,
                    color: colorMap[pitchType] || '#adb5bd',
                    line: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        width: 1
                    },
                    opacity: 0.8
                }
            });
        });

        if (highlightedIndex > -1) {
            const pitch = pitches[highlightedIndex];
            traces.push({
                x: [pitch.PlateLocSide],
                y: [pitch.PlateLocHeight],
                mode: 'markers', 
                name: '選択中',
                hoverinfo: 'text',
                hovertemplate: '<b>選択中</b><br>%{text}<extra></extra>',
                text: `${pitch.TaggedPitchType}<br>${pitch.RelSpeed.toFixed(1)} km/h<br>PitchCall: ${pitch.PitchCall}`,
                marker: { 
                    size: 18, 
                    color: 'var(--accent-yellow)', 
                    symbol: 'star',
                    line: {
                        width: 2, 
                        color: 'white'
                    }
                }
            });
        }

        const layout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: 'var(--text-primary)' },
            title: {
                text: '投球コース',
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            xaxis: { 
                gridcolor: 'var(--border-color)', 
                range: [-0.5, 0.5],
                title: {
                    text: '横位置 (m)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                },
                zerolinecolor: 'var(--border-color)'
            },
            yaxis: { 
                gridcolor: 'var(--border-color)', 
                range: [0, 1.5], 
                scaleanchor: "x", 
                scaleratio: 1,
                title: {
                    text: '高さ (m)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                },
                zerolinecolor: 'var(--border-color)'
            },
            shapes: [
                // ストライクゾーン
                {
                    type: 'rect', 
                    x0: -0.22, 
                    y0: 0.5, 
                    x1: 0.22, 
                    y1: 1.0,
                    line: { 
                        color: 'var(--accent-yellow)', 
                        width: 2 
                    },
                    fillcolor: 'rgba(255, 190, 11, 0.1)'
                },
                // ホームプレート
                {
                    type: 'path',
                    path: 'M -0.22 0 L 0 0.05 L 0.22 0 L 0 -0.05 Z',
                    line: {
                        color: 'white',
                        width: 2
                    },
                    fillcolor: 'white'
                }
            ],
            showlegend: true,
            legend: {
                orientation: 'v',
                yanchor: 'top',
                y: 1,
                xanchor: 'right',
                x: 1,
                bgcolor: 'rgba(30, 30, 30, 0.7)',
                bordercolor: 'var(--border-color)',
                borderwidth: 1,
                font: {
                    color: 'var(--text-primary)',
                    size: 12
                }
            },
            margin: {
                l: 50,
                r: 30,
                t: 50,
                b: 80
            },
            hoverlabel: {
                bgcolor: 'var(--bg-secondary)',
                bordercolor: 'var(--border-color)',
                font: {
                    color: 'var(--text-primary)'
                }
            },
            annotations: [
                {
                    x: 0,
                    y: 0.1,
                    xref: 'x',
                    yref: 'y',
                    text: 'キャッチャー位置',
                    showarrow: false,
                    font: {
                        size: 10,
                        color: 'var(--text-secondary)'
                    }
                }
            ]
        };
        
        Plotly.newPlot(chartContainer, traces, layout);
    }

    function displayAtBatResults(atBatResultsData) {
        const atBatResultsDiv = document.getElementById('at-bat-results');
        atBatResultsDiv.innerHTML = '';
        let html = '<h2>At-Bat Results</h2>';

        if (atBatResultsData && Object.keys(atBatResultsData).length > 0) {
            const inningColumns = [];
            const maxAtBatsInInning = {};

            for (const team in atBatResultsData) {
                atBatResultsData[team].forEach(batterSlot => {
                    const allResults = { ...batterSlot.results };
                    if (batterSlot.substitutes) {
                        batterSlot.substitutes.forEach(sub => {
                            for (const inning in sub.results) {
                                if (!allResults[inning]) allResults[inning] = [];
                                allResults[inning] = allResults[inning].concat(sub.results[inning]);
                            }
                        });
                    }
                    for (const inning in allResults) {
                        if (!maxAtBatsInInning[inning]) maxAtBatsInInning[inning] = 0;
                        maxAtBatsInInning[inning] = Math.max(maxAtBatsInInning[inning], allResults[inning].length);
                    }
                });
            }

            Object.keys(maxAtBatsInInning).sort((a, b) => parseInt(a) - parseInt(b)).forEach(inning => {
                for (let i = 0; i < maxAtBatsInInning[inning]; i++) {
                    inningColumns.push(inning);
                }
            });

            // チームの表示順を制御（awayTeamを先に、homeTeamを後に）
            const teams = Object.keys(atBatResultsData);
            const sortedTeams = teams.sort((a, b) => {
                // awayTeamを先に表示
                if (a === b) return 0;
                // homeTeamを特定（scoreboardDataがあれば使用）
                const firstRowData = fullGameData[0];
                if (firstRowData) {
                    if (a === firstRowData.AwayTeam) return -1;
                    if (b === firstRowData.AwayTeam) return 1;
                }
                return a.localeCompare(b);
            });

            for (const team of sortedTeams) {
                html += `<h3>${team}</h3>`;
                html += '<table><thead><tr><th>Order</th><th>Batter</th>';
                inningColumns.forEach(inning => html += `<th>${inning}</th>`);
                html += '</tr></thead><tbody>';

                atBatResultsData[team].forEach((batterSlot, index) => {
                    let batterNameStr = batterSlot.name;
                    if (batterSlot.substitutes && batterSlot.substitutes.length > 0) {
                        batterNameStr += `<br><span class="substitute">(${batterSlot.substitutes.map(s => s.name).join(', ')})</span>`;
                    }

                    html += `<tr><td>${index + 1}</td><td>${batterNameStr}</td>`;
                    
                    const playerResultsByInning = {};
                     Object.entries(batterSlot.results).forEach(([inning, results]) => {
                        if(!playerResultsByInning[inning]) playerResultsByInning[inning] = [];
                        playerResultsByInning[inning].push(...results);
                    });
                    if (batterSlot.substitutes) {
                        batterSlot.substitutes.forEach(sub => {
                             Object.entries(sub.results).forEach(([inning, results]) => {
                                if(!playerResultsByInning[inning]) playerResultsByInning[inning] = [];
                                playerResultsByInning[inning].push(...results);
                            });
                        });
                    }

                    inningColumns.forEach((inning, colIndex) => {
                        let atBat = null;
                        let currentInningCount = inningColumns.slice(0, colIndex + 1).filter(i => i === inning).length;
                        if (playerResultsByInning[inning] && playerResultsByInning[inning].length >= currentInningCount) {
                            atBat = playerResultsByInning[inning][currentInningCount - 1];
                        }
                        const cellClass = atBat ? '' : ' class="no-result"';
                        html += `<td${cellClass}>${atBat ? getResultHtml(atBat) : '-'}</td>`;
                    });
                    html += '</tr>';
                });
                html += '</tbody></table>';
            }
        } else {
            html += '<p>No at-bat result data.</p>';
        }
        atBatResultsDiv.innerHTML = html;
    }

    function displayScoreboard(scoreboardData) {
        const scoreboardDiv = document.getElementById('scoreboard');
        let html = '<h2>Game Score</h2>';
        if (scoreboardData && scoreboardData.gameDate) {
            html += `<div class="game-date">${new Date(scoreboardData.gameDate).toLocaleDateString()}</div>`;
        }
        if (Object.keys(scoreboardData).length > 2) {
            const awayTeam = scoreboardData.awayTeamName;
            const homeTeam = scoreboardData.homeTeamName;
            
            html += `<div class="scoreboard-teams">
                        <div class="team-score">
                            <span class="team-name">${awayTeam}</span>
                            <span class="score">${scoreboardData[awayTeam]}</span>
                        </div>
                        <div class="vs">vs</div>
                        <div class="team-score">
                            <span class="score">${scoreboardData[homeTeam]}</span>
                            <span class="team-name">${homeTeam}</span>
                        </div>
                     </div>`;
        } else {
            html += '<p>No scoreboard data.</p>';
        }
        scoreboardDiv.innerHTML = html;
    }

    function createTeamStatsButtons(homeTeam, awayTeam) {
        teamStatsNavigation.innerHTML = ''; // Clear existing buttons
        if (homeTeam && awayTeam) {
            const homeButton = document.createElement('button');
            homeButton.textContent = `${homeTeam} 成績`;
            homeButton.className = 'custom-button';
            homeButton.onclick = () => window.location.href = `team_stats.html?team=${encodeURIComponent(homeTeam)}`;
            teamStatsNavigation.appendChild(homeButton);

            const awayButton = document.createElement('button');
            awayButton.textContent = `${awayTeam} 成績`;
            awayButton.className = 'custom-button';
            awayButton.onclick = () => window.location.href = `team_stats.html?team=${encodeURIComponent(awayTeam)}`;
            teamStatsNavigation.appendChild(awayButton);
        }
    }

    function displayInningScores(inningScoresData) {
        const inningScoresDiv = document.getElementById('inning-scores');
        let html = '<h2>Inning Scores</h2>';
        if (Object.keys(inningScoresData).length > 0) {
            html += '<table><thead><tr><th>Team</th>';
            const innings = new Set();
            for (const team in inningScoresData) {
                Object.keys(inningScoresData[team]).forEach(inning => innings.add(inning));
            }
            const maxInning = Math.max(...Array.from(innings).map(i => parseInt(i)));
            const allInnings = Array.from({length: maxInning}, (_, i) => i + 1);

            allInnings.forEach(inning => html += `<th>${inning}</th>`);
            html += '<th>R</th></tr></thead><tbody>';

            // チームの表示順を制御（awayTeamを先に、homeTeamを後に）
            const teams = Object.keys(inningScoresData);
            const sortedTeams = teams.sort((a, b) => {
                if (a === b) return 0;
                const firstRowData = fullGameData[0];
                if (firstRowData) {
                    if (a === firstRowData.AwayTeam) return -1;
                    if (b === firstRowData.AwayTeam) return 1;
                }
                return a.localeCompare(b);
            });

            for (const team of sortedTeams) {
                let totalRuns = 0;
                html += `<tr><td>${team}</td>`;
                allInnings.forEach(inning => {
                    let runs = 0;
                    if (inningScoresData[team] && inningScoresData[team][inning] !== undefined) {
                        runs = Number(inningScoresData[team][inning]);
                        if (isNaN(runs)) {
                            runs = 0; // If not a number, treat as 0
                        }
                    }
                    totalRuns += runs;
                    html += `<td>${runs}</td>`;
                });
                html += `<td><b>${totalRuns}</b></td>`;
                html += '</tr>';
            }
            html += '</tbody></table>';
        } else {
            html += '<p>No inning score data.</p>';
        }
        inningScoresDiv.innerHTML = html;
    }
});
