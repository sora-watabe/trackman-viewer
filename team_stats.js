document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('backButton');
    const teamNameHeader = document.getElementById('team-name-header');
    const batterStatsView = document.getElementById('batter-stats-view');
    const pitcherStatsView = document.getElementById('pitcher-stats-view');
    const tabButtons = document.querySelectorAll('.tab-button');
    const teamBattingSummary = document.getElementById('team-batting-summary');
    const teamPitchingSummary = document.getElementById('team-pitching-summary');
    const battingChart = document.getElementById('batting-chart');
    const pitchingChart = document.getElementById('pitching-chart');

    const urlParams = new URLSearchParams(window.location.search);
    const teamName = urlParams.get('team') || 'チーム';
    
    teamNameHeader.textContent = `${teamName} 成績`;

    // タブ切り替え機能
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // アクティブなタブを切り替え
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 対応するパネルを表示
            const tabName = button.getAttribute('data-tab');
            document.querySelectorAll('.stats-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            
            if (tabName === 'batter') {
                batterStatsView.classList.add('active');
            } else if (tabName === 'pitcher') {
                pitcherStatsView.classList.add('active');
            }
        });
    });

    backButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    const trackmanData = JSON.parse(sessionStorage.getItem('trackmanData'));

    if (trackmanData) {
        const batterStatsData = calculateBatterStats(trackmanData, teamName);
        displayBatterStats(batterStatsData);

        const pitcherStatsData = calculatePitcherStats(trackmanData, teamName);
        displayPitcherStats(pitcherStatsData);
    } else {
        batterStatsView.innerHTML = '<p>データがありません。前のページに戻ってCSVファイルをアップロードしてください。</p>';
        pitcherStatsView.innerHTML = '';
    }

    function calculateBatterStats(data, team) {
        const stats = {};
        const batterOrder = [];
        const seenBatters = new Set();
        const processedPa = new Set();

        // First pass to establish batting order from the start of the game
        data.forEach(row => {
            if (row.BatterTeam === team && row.PitchofPA === 1 && !seenBatters.has(row.Batter)) {
                const batterName = row.Batter;
                if (batterName) {
                    batterOrder.push(batterName);
                    seenBatters.add(batterName);
                    stats[batterName] = {
                        plateAppearances: 0, atBats: 0, hits: 0, homeRuns: 0, strikeouts: 0,
                        walks: 0, hitByPitch: 0, sacBunts: 0, sacFlies: 0,
                        stolenBases: 0, caughtStealing: 0
                    };
                }
            }
        });

        // Second pass to calculate stats for each PA
        for (let i = data.length - 1; i >= 0; i--) {
            const row = data[i];
            if (row.BatterTeam !== team) continue;

            const paCount = row.paCount;
            if (!paCount || processedPa.has(paCount)) continue;

            const batterName = row.Batter;
            if (!batterName || !stats[batterName]) continue;

            const s = stats[batterName];
            const playResult = row.PlayResult ? String(row.PlayResult).trim() : '';
            const korBB = row.KorBB ? String(row.KorBB).trim() : '';
            const pitchCall = row.PitchCall ? String(row.PitchCall).trim() : '';
            const event = row.Event ? String(row.Event).trim() : '';

            s.plateAppearances++;
            let isAtBat = true;

            if (pitchCall === 'HitByPitch' || playResult === 'HitByPitch' || event === 'HitByPitch' || korBB === 'HitByPitch') {
                s.hitByPitch++;
                isAtBat = false;
            } else if (korBB === 'Walk') {
                s.walks++;
                isAtBat = false;
            } else if (playResult === 'Sacrifice') {
                s.sacFlies++;
                isAtBat = false;
            }

            if (isAtBat) s.atBats++;
            if (['Single', 'Double', 'Triple', 'HomeRun'].includes(playResult)) s.hits++;
            if (playResult === 'HomeRun') s.homeRuns++;
            if (korBB === 'Strikeout') s.strikeouts++;

            processedPa.add(paCount);
        }
        return { stats, batterOrder };
    }

    function displayBatterStats(batterStatsData) {
        const { stats, batterOrder } = batterStatsData;
        
        // チーム打撃成績サマリーを表示
        let totalPA = 0, totalAB = 0, totalH = 0, totalHR = 0, totalSO = 0, totalBB = 0;
        
        Object.values(stats).forEach(s => {
            totalPA += s.plateAppearances;
            totalAB += s.atBats;
            totalH += s.hits;
            totalHR += s.homeRuns;
            totalSO += s.strikeouts;
            totalBB += s.walks;
        });
        
        const teamAvg = totalAB > 0 ? (totalH / totalAB).toFixed(3) : '.000';
        
        teamBattingSummary.innerHTML = `
            <h3>チーム打撃成績</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${teamAvg}</div>
                    <div class="stat-label">打率</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalH}</div>
                    <div class="stat-label">安打</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalHR}</div>
                    <div class="stat-label">本塁打</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalBB}</div>
                    <div class="stat-label">四球</div>
                </div>
            </div>
        `;
        
        // 打撃成績グラフを表示
        const hitTypes = ['Single', 'Double', 'Triple', 'HomeRun'];
        const hitCounts = [
            totalH - totalHR, // Singles (安打 - 本塁打)
            0, // Doubles (データがないため0)
            0, // Triples (データがないため0)
            totalHR // Home Runs
        ];
        
        const trace = {
            x: ['単打', '二塁打', '三塁打', '本塁打'],
            y: hitCounts,
            type: 'bar',
            marker: {
                color: ['#3a86ff', '#8338ec', '#ff006e', '#ffbe0b'],
                line: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    width: 1
                }
            },
            hoverinfo: 'y+name',
            hovertemplate: '<b>%{x}</b>: %{y}本<extra></extra>',
            textposition: 'auto',
            text: hitCounts,
            textfont: {
                color: 'white'
            }
        };
        
        const layout = {
            title: {
                text: '安打タイプ分布',
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: 'var(--text-primary)' },
            xaxis: { 
                gridcolor: 'var(--border-color)',
                title: {
                    text: '安打タイプ',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            yaxis: { 
                gridcolor: 'var(--border-color)',
                title: {
                    text: '本数',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            margin: {
                l: 50,
                r: 30,
                t: 50,
                b: 50
            },
            bargap: 0.3,
            bargroupgap: 0.1,
            hoverlabel: {
                bgcolor: 'var(--bg-secondary)',
                bordercolor: 'var(--border-color)',
                font: {
                    color: 'var(--text-primary)'
                }
            }
        };
        
        Plotly.newPlot(battingChart, [trace], layout);
        
        // 打者個人成績テーブルを表示
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>選手名</th><th>打席</th><th>打数</th><th>安打</th><th>本塁打</th>
                        <th>三振</th><th>四球</th><th>死球</th><th>犠打</th><th>犠飛</th>
                        <th>盗塁</th><th>盗塁死</th><th>打率</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        batterOrder.forEach(batterName => {
            const s = stats[batterName];
            if (!s) return;
            const avg = s.atBats > 0 ? (s.hits / s.atBats).toFixed(3) : '.000';
            html += `
                <tr>
                    <td>${batterName}</td><td>${s.plateAppearances}</td><td>${s.atBats}</td>
                    <td>${s.hits}</td><td>${s.homeRuns}</td><td>${s.strikeouts}</td>
                    <td>${s.walks}</td><td>${s.hitByPitch}</td><td>${s.sacBunts}</td>
                    <td>${s.sacFlies}</td><td>${s.stolenBases}</td><td>${s.caughtStealing}</td>
                    <td>${avg}</td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        batterStatsView.innerHTML += html;
    }

    function calculatePitcherStats(data, team) {
        const stats = {};
        const pitcherOrder = [];
        const seenPitchers = new Set();

        data.forEach(row => {
            if (row.PitcherTeam !== team) return;
            
            const pitcherName = row.Pitcher;
            if (!pitcherName) return;

            if (!seenPitchers.has(pitcherName)) {
                pitcherOrder.push(pitcherName);
                seenPitchers.add(pitcherName);
                stats[pitcherName] = {
                    pitchCount: 0, hits: 0, homeRuns: 0, strikeouts: 0, walks: 0, hitByPitch: 0
                };
            }
            
            const s = stats[pitcherName];
            s.pitchCount++;

            const playResult = row.PlayResult ? String(row.PlayResult).trim() : '';
            const korBB = row.KorBB ? String(row.KorBB).trim() : '';
            const pitchCall = row.PitchCall ? String(row.PitchCall).trim() : '';
            const event = row.Event ? String(row.Event).trim() : '';

            if (['Single', 'Double', 'Triple', 'HomeRun'].includes(playResult)) s.hits++;
            if (playResult === 'HomeRun') s.homeRuns++;
            if (korBB === 'Strikeout') s.strikeouts++;
            if (korBB === 'Walk') s.walks++;
            if (pitchCall === 'HitByPitch' || playResult === 'HitByPitch' || event === 'HitByPitch' || korBB === 'HitByPitch') s.hitByPitch++;
        });
        return { stats, pitcherOrder };
    }

    function displayPitcherStats(pitcherStatsData) {
        const { stats, pitcherOrder } = pitcherStatsData;
        
        // チーム投手成績サマリーを表示
        let totalPitches = 0, totalHits = 0, totalHR = 0, totalSO = 0, totalBB = 0, totalHBP = 0;
        
        Object.values(stats).forEach(s => {
            totalPitches += s.pitchCount;
            totalHits += s.hits;
            totalHR += s.homeRuns;
            totalSO += s.strikeouts;
            totalBB += s.walks;
            totalHBP += s.hitByPitch;
        });
        
        teamPitchingSummary.innerHTML = `
            <h3>チーム投手成績</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${totalPitches}</div>
                    <div class="stat-label">投球数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalSO}</div>
                    <div class="stat-label">奪三振</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalBB}</div>
                    <div class="stat-label">与四球</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${totalHits}</div>
                    <div class="stat-label">被安打</div>
                </div>
            </div>
        `;
        
        // 投手成績グラフを表示
        const pitcherNames = pitcherOrder.slice(0, 5); // 最初の5人の投手のみ表示
        const strikeoutData = pitcherNames.map(name => stats[name] ? stats[name].strikeouts : 0);
        const walkData = pitcherNames.map(name => stats[name] ? stats[name].walks : 0);
        
        const trace1 = {
            x: pitcherNames,
            y: strikeoutData,
            name: '奪三振',
            type: 'bar',
            marker: { 
                color: '#3a86ff',
                line: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    width: 1
                }
            },
            hoverinfo: 'y+name',
            hovertemplate: '<b>%{x}</b>: %{y}個<extra></extra>',
            textposition: 'auto',
            text: strikeoutData,
            textfont: {
                color: 'white'
            }
        };
        
        const trace2 = {
            x: pitcherNames,
            y: walkData,
            name: '与四球',
            type: 'bar',
            marker: { 
                color: '#ff006e',
                line: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    width: 1
                }
            },
            hoverinfo: 'y+name',
            hovertemplate: '<b>%{x}</b>: %{y}個<extra></extra>',
            textposition: 'auto',
            text: walkData,
            textfont: {
                color: 'white'
            }
        };
        
        const layout = {
            title: {
                text: '投手成績比較',
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            barmode: 'group',
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: 'var(--text-primary)' },
            xaxis: { 
                gridcolor: 'var(--border-color)',
                title: {
                    text: '投手名',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            yaxis: { 
                gridcolor: 'var(--border-color)',
                title: {
                    text: '数',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            margin: {
                l: 50,
                r: 30,
                t: 50,
                b: 80
            },
            bargap: 0.15,
            bargroupgap: 0.1,
            hoverlabel: {
                bgcolor: 'var(--bg-secondary)',
                bordercolor: 'var(--border-color)',
                font: {
                    color: 'var(--text-primary)'
                }
            },
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: -0.2,
                xanchor: 'center',
                x: 0.5,
                bgcolor: 'transparent',
                bordercolor: 'var(--border-color)',
                borderwidth: 1,
                font: {
                    color: 'var(--text-primary)'
                }
            }
        };
        
        Plotly.newPlot(pitchingChart, [trace1, trace2], layout);
        
        // 投手個人成績テーブルを表示
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>選手名</th><th>投球数</th><th>被安打</th><th>被本塁打</th>
                        <th>奪三振</th><th>与四球</th><th>与死球</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        pitcherOrder.forEach(pitcherName => {
            const s = stats[pitcherName];
            if (!s) return;
            html += `
                <tr>
                    <td>${pitcherName}</td><td>${s.pitchCount}</td><td>${s.hits}</td>
                    <td>${s.homeRuns}</td><td>${s.strikeouts}</td><td>${s.walks}</td>
                    <td>${s.hitByPitch}</td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        pitcherStatsView.innerHTML += html;
    }
});
