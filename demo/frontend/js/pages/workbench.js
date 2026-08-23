(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('高标农田专项整治', '工作台');
  AppIcons.injectAll(document);

  var RANK_TYPES = [
    { key: 'well', label: '机井' },
    { key: 'road', label: '道路' },
    { key: 'bridge', label: '桥涵闸' },
    { key: 'forest', label: '林网' },
    { key: 'transformer', label: '变压器' },
    { key: 'other', label: '其他' },
  ];

  var trendRange = 'week7';
  var trendChart = null;
  var sparkCharts = [];

  var s = AppData.stats();
  var rateNum = s.total > 0 ? Math.round((s.done / s.total) * 1000) / 10 : 0;
  var rate = rateNum + '%';

  function countOtherTypes() {
    var known = { well: 1, road: 1, bridge: 1, forest: 1, transformer: 1 };
    return AppData.getIssues().filter(function (i) {
      return !known[i.type];
    }).length;
  }

  function typeCount(key) {
    if (key === 'other') return countOtherTypes();
    return s.byType[key] || 0;
  }

  function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function dayKey(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function yearKey(d) {
    return String(d.getFullYear());
  }

  function aggregateTrend(keys, labelFn, matchFn) {
    var labels = [];
    var reported = [];
    var completed = [];
    var pending = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      labels.push(labelFn(keys[i], i));
      reported.push(0);
      completed.push(0);
      pending.push(0);
    }
    AppData.getIssues().forEach(function (issue) {
      if (issue.createdAt) {
        var ci = matchFn(new Date(issue.createdAt), keys);
        if (ci >= 0) reported[ci] += 1;
      }
      if (issue.status === 'pending' && issue.createdAt) {
        var pi = matchFn(new Date(issue.createdAt), keys);
        if (pi >= 0) pending[pi] += 1;
      }
      if (issue.status === 'done' && issue.rectifyAt) {
        var ri = matchFn(new Date(issue.rectifyAt), keys);
        if (ri >= 0) completed[ri] += 1;
      }
    });
    return { labels: labels, reported: reported, completed: completed, pending: pending };
  }

  function buildTrend(range) {
    var now = new Date();
    var keys = [];
    var i;

    if (range === 'week7') {
      for (i = 6; i >= 0; i--) {
        keys.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
      }
      return aggregateTrend(
        keys,
        function (k) {
          var p = k.split('-');
          return Number(p[1]) + '/' + Number(p[2]);
        },
        function (d, list) {
          return list.indexOf(dayKey(d));
        }
      );
    }

    if (range === 'month1') {
      for (i = 29; i >= 0; i--) {
        keys.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
      }
      return aggregateTrend(
        keys,
        function (k) {
          var p = k.split('-');
          return Number(p[1]) + '/' + Number(p[2]);
        },
        function (d, list) {
          return list.indexOf(dayKey(d));
        }
      );
    }

    if (range === 'halfyear') {
      for (i = 5; i >= 0; i--) {
        keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
      }
      return aggregateTrend(
        keys,
        function (k) {
          return Number(k.split('-')[1]) + '月';
        },
        function (d, list) {
          return list.indexOf(monthKey(d));
        }
      );
    }

    var yearSet = {};
    yearSet[now.getFullYear()] = 1;
    AppData.getIssues().forEach(function (issue) {
      if (issue.createdAt) yearSet[new Date(issue.createdAt).getFullYear()] = 1;
      if (issue.status === 'done' && issue.rectifyAt) {
        yearSet[new Date(issue.rectifyAt).getFullYear()] = 1;
      }
    });
    keys = Object.keys(yearSet)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .map(String);
    if (!keys.length) keys = [String(now.getFullYear())];
    return aggregateTrend(
      keys,
      function (k) {
        return k + '年';
      },
      function (d, list) {
        return list.indexOf(yearKey(d));
      }
    );
  }

  function sparkAreaColor(hex) {
    if (hex === '#1a7f4b') {
      return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(26, 127, 75, 0.25)' },
        { offset: 1, color: 'rgba(255, 255, 255, 0)' },
      ]);
    }
    if (hex === '#c47a06') {
      return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(196, 122, 6, 0.22)' },
        { offset: 1, color: 'rgba(255, 255, 255, 0)' },
      ]);
    }
    return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(1, 92, 187, 0.25)' },
      { offset: 1, color: 'rgba(255, 255, 255, 0)' },
    ]);
  }

  function doneCountByType(key) {
    if (key === 'other') {
      var known = { well: 1, road: 1, bridge: 1, forest: 1, transformer: 1 };
      return AppData.getIssues().filter(function (i) {
        return i.status === 'done' && !known[i.type];
      }).length;
    }
    return AppData.getIssues().filter(function (i) {
      return i.status === 'done' && i.type === key;
    }).length;
  }

  function sparkTooltip() {
    return {
      trigger: 'axis',
      confine: true,
      padding: [6, 10],
      borderWidth: 0,
      backgroundColor: '#fff',
      textStyle: { color: '#595959', fontSize: 12 },
      extraCssText: 'box-shadow:0 2px 8px rgba(0,0,0,0.08);',
      axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#d9d9d9' } },
      formatter: function (params) {
        var p = params[0];
        return p.name + ': ' + p.value;
      },
    };
  }

  var SPARK_LINE_WIDTH = 2;

  function sparkYAxisMax(value) {
    var m = value.max;
    if (m <= 0) return 1;
    return Math.ceil(m * 1.15);
  }

  function sparkLineOption(labels, data, color, name) {
    return {
      tooltip: sparkTooltip(),
      grid: { left: 0, right: 0, top: 6, bottom: 8 },
      xAxis: {
        type: 'category',
        show: false,
        boundaryGap: false,
        data: labels,
      },
      yAxis: {
        type: 'value',
        show: false,
        min: 0,
        max: sparkYAxisMax,
        minInterval: 1,
      },
      series: [
        {
          name: name,
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: data,
          lineStyle: { width: SPARK_LINE_WIDTH, color: color },
          emphasis: { lineStyle: { width: SPARK_LINE_WIDTH, color: color } },
          areaStyle: { color: sparkAreaColor(color) },
        },
      ],
    };
  }

  function sparkBarOption(labels, data) {
    return {
      tooltip: sparkTooltip(),
      grid: { left: 0, right: 0, top: 6, bottom: 8 },
      xAxis: {
        type: 'category',
        show: false,
        data: labels,
      },
      yAxis: {
        type: 'value',
        show: false,
        min: 0,
        max: sparkYAxisMax,
        minInterval: 1,
      },
      series: [
        {
          type: 'bar',
          data: data.map(function (v) {
            return {
              value: v,
              itemStyle:
                v === 0
                  ? {
                      opacity: 0.35,
                      borderRadius: [3, 3, 0, 0],
                      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(1, 92, 187, 0.35)' },
                        { offset: 1, color: 'rgba(1, 92, 187, 0.55)' },
                      ]),
                    }
                  : {
                      borderRadius: [3, 3, 0, 0],
                      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(1, 92, 187, 0.45)' },
                        { offset: 1, color: '#015cbb' },
                      ]),
                    },
            };
          }),
          barWidth: '38%',
          barMinHeight: 4,
        },
      ],
    };
  }

  function renderStats() {
    var grid = document.getElementById('statGrid');
    var cards = [
      {
        label: '上报数量',
        value: s.total,
        foot: '累计排查上报',
        spark: 'line',
        color: '#015cbb',
      },
      {
        label: '待整改',
        value: s.pending,
        foot: '当前待处理',
        spark: 'line',
        color: '#c47a06',
      },
      {
        label: '已整改',
        value: s.done,
        foot: '已完成闭环',
        spark: 'bar',
        color: '#1a7f4b',
      },
      {
        label: '整改完成率',
        value: rate,
        foot: '已整改 / 上报',
        spark: 'progress',
        color: '#015cbb',
      },
    ];

    grid.innerHTML = cards
      .map(function (c, idx) {
        var body =
          c.spark === 'progress'
            ? '<div class="wb-stat__progress" aria-hidden="true"><div class="wb-stat__progress-bar" style="width:' +
              rateNum +
              '%"></div></div>'
            : '<div class="wb-stat__chart wb-stat__chart--interactive" id="statSpark' +
              idx +
              '" aria-hidden="true"></div>';
        return (
          '<article class="wb-stat">' +
          '<div class="wb-stat__label">' +
          c.label +
          '</div>' +
          '<div class="wb-stat__value">' +
          c.value +
          '</div>' +
          body +
          '<div class="wb-stat__divider"></div>' +
          '<div class="wb-stat__foot">' +
          c.foot +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    var trend = buildTrend(trendRange);
    var typeLabels = RANK_TYPES.map(function (t) {
      return t.label;
    });
    var typeDone = RANK_TYPES.map(function (t) {
      return doneCountByType(t.key);
    });

    sparkCharts.forEach(function (c) {
      if (c) c.dispose();
    });
    sparkCharts = [];

    cards.forEach(function (c, idx) {
      if (c.spark === 'progress') return;
      var dom = document.getElementById('statSpark' + idx);
      if (!dom || !window.echarts) return;
      var chart = echarts.init(dom);

      if (c.spark === 'bar') {
        chart.setOption(sparkBarOption(typeLabels, typeDone));
      } else if (idx === 0) {
        chart.setOption(sparkLineOption(trend.labels, trend.reported, c.color, '上报'));
      } else if (idx === 1) {
        chart.setOption(sparkLineOption(trend.labels, trend.pending, c.color, '待整改'));
      }

      sparkCharts.push(chart);
    });
  }

  function renderTrendChart() {
    var dom = document.getElementById('trendChart');
    if (!dom || !window.echarts) return;
    var trend = buildTrend(trendRange);
    var primary = '#015cbb';
    var accent = '#1a7f4b';

    if (!trendChart) trendChart = echarts.init(dom);

    trendChart.setOption({
      color: [primary, accent],
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: 18, top: 12, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: '#6b7a90', margin: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: function (value) {
          var m = value.max;
          if (m <= 0) return 2;
          return Math.ceil(m * 1.12);
        },
        minInterval: 1,
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { type: 'dashed', color: '#eef1f5' } },
        axisLabel: { color: '#6b7a90' },
      },
      series: [
        {
          name: '上报',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: trend.reported,
          lineStyle: { width: 3, color: primary },
          itemStyle: { color: primary },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(1, 92, 187, 0.3)' },
              { offset: 1, color: 'rgba(1, 92, 187, 0)' },
            ]),
          },
        },
        {
          name: '完成整改',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: trend.completed,
          lineStyle: { width: 3, color: accent },
          itemStyle: { color: accent },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(26, 127, 75, 0.24)' },
              { offset: 1, color: 'rgba(26, 127, 75, 0)' },
            ]),
          },
        },
      ],
    });
    syncTrendChartHeight();
  }

  function formatRegion(issue) {
    var parts = [];
    if (issue.street) parts.push(issue.street);
    if (issue.village) parts.push(issue.village);
    return parts.length ? parts.join(' / ') : '—';
  }

  function syncTrendChartHeight() {
    var rankList = document.getElementById('typeRank');
    var chartDom = document.getElementById('trendChart');
    if (!rankList || !chartDom) return;
    chartDom.style.height = rankList.offsetHeight + 'px';
    if (trendChart) trendChart.resize();
  }

  function renderTypeRank() {
    var typeRank = document.getElementById('typeRank');
    if (!typeRank) return;
    var rows = RANK_TYPES.map(function (t) {
      return { label: t.label, n: typeCount(t.key) };
    }).sort(function (a, b) {
      return b.n - a.n;
    });

    typeRank.innerHTML = rows
      .map(function (r, idx) {
        return (
          '<div class="wb-rank-row">' +
          '<span class="wb-rank-row__no">' +
          (idx + 1) +
          '</span>' +
          '<span class="wb-rank-row__name">' +
          r.label +
          '</span>' +
          '<span class="wb-rank-row__val">' +
          r.n +
          '</span></div>'
        );
      })
      .join('');
    syncTrendChartHeight();
  }

  function bindRange() {
    var rangeRoot = document.getElementById('trendRange');
    if (!rangeRoot) return;
    rangeRoot.addEventListener('click', function (e) {
      var item = e.target.closest('.seg-item');
      if (!item || !rangeRoot.contains(item)) return;
      trendRange = item.getAttribute('data-range');
      Array.prototype.forEach.call(rangeRoot.querySelectorAll('.seg-item'), function (el) {
        var on = el === item;
        el.classList.toggle('active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderTrendChart();
      renderStats();
    });
  }

  function renderTodo() {
    var tbody = document.querySelector('#todoTable tbody');
    var pending = AppData.getIssues().filter(function (i) {
      return i.status === 'pending';
    });
    if (!pending.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="app-empty">暂无待办</td></tr>';
      return;
    }
    tbody.innerHTML = pending
      .map(function (i) {
        var left = AppData.daysLeft(i.planDate);
        var leftText =
          left == null ? '—' : left < 0 ? '已逾期 ' + Math.abs(left) + ' 天' : '剩余 ' + left + ' 天';
        var tag =
          left != null && left < 0
            ? 'app-tag app-tag--danger'
            : left != null && left <= 3
              ? 'app-tag app-tag--warning'
              : 'app-tag';
        return (
          '<tr><td>' +
          (AppData.TYPE_LABEL[i.type] || i.type) +
          '</td><td>' +
          (i.code || '—') +
          '</td><td>' +
          formatRegion(i) +
          '</td><td>' +
          (i.assigneeName || '—') +
          '</td><td>' +
          (i.planDate || '—') +
          '</td><td><span class="' +
          tag +
          '">' +
          leftText +
          '</span></td><td><span class="app-tag app-tag--warning">待整改</span></td></tr>'
        );
      })
      .join('');
  }

  function bindResize() {
    if (typeof ResizeObserver === 'undefined') return;
    var rankList = document.getElementById('typeRank');
    if (!rankList) return;
    new ResizeObserver(function () {
      syncTrendChartHeight();
      sparkCharts.forEach(function (c) {
        if (c) c.resize();
      });
    }).observe(rankList);
  }

  renderStats();
  renderTypeRank();
  renderTrendChart();
  renderTodo();
  bindRange();
  bindResize();
})();
