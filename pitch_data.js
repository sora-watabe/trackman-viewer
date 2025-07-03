document.addEventListener('DOMContentLoaded', () => {
    const pitcherSelect = document.getElementById('pitcher-select');
    const graphToggleButtons = document.getElementById('graph-toggle-buttons');
    const pitchListContainer = document.getElementById('pitch-list-container');
    const timeSeriesChart = document.getElementById('time-series-chart');
    const pitchLocationChart = document.getElementById('pitch-location-chart');
    const movementChart = document.getElementById('movement-chart');

    const trackmanData = JSON.parse(sessionStorage.getItem('trackmanData'));

    if (!trackmanData) {
        document.querySelector('.container').innerHTML = '<p>データがありません。<a href="index.html">ホームページ</a>に戻ってCSVファイルをアップロードしてください。</p>';
        return;
    }

    const pitchers = [...new Set(trackmanData.map(row => row.Pitcher))].sort();
    pitchers.forEach(pitcher => {
        const option = document.createElement('option');
        option.value = pitcher;
        option.textContent = pitcher;
        pitcherSelect.appendChild(option);
    });

    let currentPitcher = pitchers[0];
    let currentGraphType = 'speed';

    function updateAllVisuals() {
        const pitcherData = trackmanData.filter(row => row.Pitcher === currentPitcher);
        renderPitchList(pitcherData);
        updateCharts(pitcherData);
    }

    function updateCharts(pitcherData, highlightedPitchIndex = -1) {
        drawTimeSeriesChart(pitcherData, currentGraphType, highlightedPitchIndex);
        drawPitchLocationChart(pitcherData, highlightedPitchIndex);
        drawMovementChart(pitcherData, highlightedPitchIndex);
    }

    pitcherSelect.addEventListener('change', (e) => {
        currentPitcher = e.target.value;
        updateAllVisuals();
    });

    graphToggleButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('#graph-toggle-buttons button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentGraphType = e.target.dataset.graph;
            const pitcherData = trackmanData.filter(row => row.Pitcher === currentPitcher);
            updateCharts(pitcherData);
        }
    });

    function renderPitchList(data) {
        pitchListContainer.innerHTML = '<h3>投球一覧</h3>';
        const list = document.createElement('ul');
        list.className = 'pitch-list';
        data.forEach((pitch, index) => {
            const item = document.createElement('li');
            item.textContent = `#${index + 1}: ${pitch.TaggedPitchType} - ${pitch.RelSpeed.toFixed(1)} km/h (${pitch.PitchCall})`;
            item.dataset.index = index;
            item.addEventListener('click', () => {
                document.querySelectorAll('.pitch-list li').forEach(li => li.classList.remove('selected'));
                item.classList.add('selected');
                updateCharts(data, index);
            });
            list.appendChild(item);
        });
        pitchListContainer.appendChild(list);
    }

    const plotlyLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: 'var(--text-primary)' },
        xaxis: { 
            gridcolor: 'var(--border-color)',
            zerolinecolor: 'var(--border-color)'
        },
        yaxis: { 
            gridcolor: 'var(--border-color)',
            zerolinecolor: 'var(--border-color)'
        },
        margin: {
            l: 50,
            r: 30,
            t: 50,
            b: 50
        },
        hoverlabel: {
            bgcolor: 'var(--bg-secondary)',
            bordercolor: 'var(--border-color)',
            font: {
                color: 'var(--text-primary)'
            }
        }
    };

    function drawTimeSeriesChart(data, type, highlightedIndex) {
        const traces = [];
        const pitchTypes = [...new Set(data.map(d => d.TaggedPitchType))];
        const yAxisMap = {
            speed: { key: 'RelSpeed', title: '球速 (km/h)' },
            spin: { key: 'SpinRate', title: '回転数 (rpm)' },
            axis: { key: 'SpinAxis', title: '回転軸 (°)' }
        };

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
            const typeData = data.filter(d => d.TaggedPitchType === pitchType);
            traces.push({
                x: typeData.map(d => data.indexOf(d)),
                y: typeData.map(d => d[yAxisMap[type].key]),
                mode: 'lines+markers', 
                name: pitchType, 
                type: 'scatter',
                line: {
                    width: 2,
                    color: colorMap[pitchType] || '#adb5bd'
                },
                marker: {
                    size: 8,
                    color: colorMap[pitchType] || '#adb5bd',
                    line: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        width: 1
                    }
                },
                hovertemplate: `<b>${pitchType}</b><br>${yAxisMap[type].title}: %{y}<extra></extra>`
            });
        });
        
        if (highlightedIndex > -1) {
            const pitch = data[highlightedIndex];
            traces.push({
                x: [highlightedIndex],
                y: [pitch[yAxisMap[type].key]],
                mode: 'markers', 
                name: 'Selected',
                marker: { 
                    size: 14, 
                    color: 'var(--accent-yellow)', 
                    symbol: 'star',
                    line: {
                        color: 'white',
                        width: 2
                    }
                },
                hovertemplate: `<b>選択中</b><br>${yAxisMap[type].title}: %{y}<extra></extra>`
            });
        }

        const layout = { 
            ...plotlyLayout, 
            title: {
                text: `${currentPitcher} - ${yAxisMap[type].title} 推移`,
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: {
                    text: '投球順',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            yaxis: {
                ...plotlyLayout.yaxis, 
                title: {
                    text: yAxisMap[type].title,
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: -0.2,
                xanchor: 'center',
                x: 0.5,
                bgcolor: 'transparent',
                font: {
                    color: 'var(--text-primary)'
                }
            }
        };
        Plotly.newPlot(timeSeriesChart, traces, layout);
    }

    function drawPitchLocationChart(data, highlightedIndex) {
        const traces = [];
        const pitchTypes = [...new Set(data.map(d => d.TaggedPitchType))];
        
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
            const typeData = data.filter(d => d.TaggedPitchType === pitchType);
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
                    size: 10,
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
            const pitch = data[highlightedIndex];
            traces.push({
                x: [pitch.PlateLocSide],
                y: [pitch.PlateLocHeight],
                mode: 'markers', 
                name: 'Selected',
                hoverinfo: 'text',
                hovertemplate: '<b>選択中</b><br>%{text}<extra></extra>',
                text: `${pitch.TaggedPitchType}<br>${pitch.RelSpeed.toFixed(1)} km/h<br>PitchCall: ${pitch.PitchCall}`,
                marker: { 
                    size: 16, 
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
            ...plotlyLayout, 
            title: {
                text: '投球コース',
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            xaxis: { 
                ...plotlyLayout.xaxis, 
                range: [-0.5, 0.5],
                title: {
                    text: '横位置 (m)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
            },
            yaxis: { 
                ...plotlyLayout.yaxis, 
                range: [0, 1.5], 
                scaleanchor: "x", 
                scaleratio: 1,
                title: {
                    text: '高さ (m)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }
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
        Plotly.newPlot(pitchLocationChart, traces, layout);
    }

    function drawMovementChart(data, highlightedIndex) {
        const traces = [];
        const pitchTypes = [...new Set(data.map(d => d.TaggedPitchType))];
        
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
            const typeData = data.filter(d => d.TaggedPitchType === pitchType);
            traces.push({
                x: typeData.map(d => d.HorzBreak),
                y: typeData.map(d => d.InducedVertBreak),
                mode: 'markers',
                type: 'scatter',
                name: pitchType,
                hoverinfo: 'text',
                hovertemplate: '<b>%{text}</b><extra></extra>',
                text: typeData.map(d => `${d.TaggedPitchType}<br>${d.RelSpeed.toFixed(1)} km/h<br>横変化: ${d.HorzBreak.toFixed(1)} cm<br>縦変化: ${d.InducedVertBreak.toFixed(1)} cm`),
                marker: { 
                    size: 10,
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
            const pitch = data[highlightedIndex];
            traces.push({
                x: [pitch.HorzBreak],
                y: [pitch.InducedVertBreak],
                mode: 'markers', 
                name: 'Selected',
                hoverinfo: 'text',
                hovertemplate: '<b>選択中</b><br>%{text}<extra></extra>',
                text: `${pitch.TaggedPitchType}<br>${pitch.RelSpeed.toFixed(1)} km/h<br>横変化: ${pitch.HorzBreak.toFixed(1)} cm<br>縦変化: ${pitch.InducedVertBreak.toFixed(1)} cm`,
                marker: { 
                    size: 16, 
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
            ...plotlyLayout, 
            title: {
                text: '変化量 (縦・横)',
                font: {
                    size: 20,
                    color: 'var(--text-primary)'
                }
            },
            xaxis: {
                ...plotlyLayout.xaxis, 
                title: {
                    text: '横変化 (cm)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }, 
                range: [-80, 80],
                zeroline: true,
                zerolinecolor: 'rgba(255, 255, 255, 0.5)',
                zerolinewidth: 1
            }, 
            yaxis: {
                ...plotlyLayout.yaxis, 
                title: {
                    text: '縦変化 (cm)',
                    font: {
                        size: 14,
                        color: 'var(--text-secondary)'
                    }
                }, 
                range: [-80, 80], 
                scaleanchor: "x", 
                scaleratio: 1,
                zeroline: true,
                zerolinecolor: 'rgba(255, 255, 255, 0.5)',
                zerolinewidth: 1
            },
            shapes: [
                // 中心点を示す円
                {
                    type: 'circle',
                    xref: 'x',
                    yref: 'y',
                    x0: -5,
                    y0: -5,
                    x1: 5,
                    y1: 5,
                    line: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        width: 1
                    },
                    fillcolor: 'rgba(255, 255, 255, 0.1)'
                }
            ],
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
            annotations: [
                {
                    x: 0,
                    y: 0,
                    xref: 'x',
                    yref: 'y',
                    text: '原点',
                    showarrow: false,
                    font: {
                        size: 10,
                        color: 'var(--text-secondary)'
                    }
                }
            ]
        };
        Plotly.newPlot(movementChart, traces, layout);
    }

    if (pitchers.length > 0) {
        updateAllVisuals();
    }
});
