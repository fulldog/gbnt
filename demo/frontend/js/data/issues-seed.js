/**
 * 排查 / 待办清单 · 种子数据（issues-seed-v20）
 *
 * 每类型 5 条：待整改 ×1、已整改 ×2、已排查 ×2
 * 图片统一 picsum 网络图；含 quizSteps / 类型块 / 电子签名，对齐巡查向导与详情页
 */
(function (global) {
  function buildIssuesSeed(ctx) {
    var now = ctx.now;
    var fmt = ctx.fmt;
    var planSoon = ctx.planSoon;
    var planOverdue = ctx.planOverdue;
    var planHours = ctx.planHours;
    var planFar = ctx.planFar;
    var doneThisYear = ctx.doneThisYear;
    var doneLastYear = ctx.doneLastYear;

    function pic(seed, w, h) {
      return 'https://picsum.photos/seed/' + seed + '/' + (w || 800) + '/' + (h || 500);
    }

    function signPic(seed) {
      return pic(seed, 360, 120);
    }

    function slot(answer, opt) {
      opt = opt || {};
      var s = {
        answer: answer,
        desc: opt.desc || '',
        photos: opt.photos ? opt.photos.slice() : [],
      };
      if (opt.photoProof) s.photoProof = opt.photoProof;
      return s;
    }

    function mergeQuizPhotos(quizSteps) {
      var all = [];
      Object.keys(quizSteps || {}).forEach(function (key) {
        var q = quizSteps[key];
        if (q && q.photos && q.photos.length) all = all.concat(q.photos);
      });
      return all;
    }

    function mergeQuizDesc(quizSteps, names) {
      var parts = [];
      Object.keys(quizSteps || {}).forEach(function (key) {
        var q = quizSteps[key];
        if (q && q.desc) parts.push((names[key] || key) + '：' + q.desc);
      });
      return parts.join('\n');
    }

    function agoDays(d) {
      return new Date(now.getTime() - d * 86400000).toISOString();
    }

    function toDateKeyFromIso(iso) {
      var d = iso ? new Date(iso) : new Date(now);
      if (isNaN(d.getTime())) return '';
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }

    function baseIssue(opt) {
      var quizSteps = opt.quizSteps || {};
      var mergedPhotos = mergeQuizPhotos(quizSteps);
      if (!mergedPhotos.length && opt.fallbackPhotos) mergedPhotos = opt.fallbackPhotos.slice();
      if (!mergedPhotos.length) mergedPhotos = [pic('hsf-' + opt.id)];

      var issue = {
        id: opt.id,
        type: opt.type,
        street: opt.street,
        village: opt.village,
        naturalVillage: opt.naturalVillage || '',
        projectYear: opt.projectYear,
        projectName: opt.projectYear + ' 高标农田建设项目',
        code: opt.code,
        locationText: opt.locationText,
        lat: opt.lat,
        lng: opt.lng,
        address: opt.address,
        photoSrc: mergedPhotos[0],
        photos: mergedPhotos,
        avatarSrc: '',
        description: opt.description || mergeQuizDesc(quizSteps, opt.quizNames || {}) || opt.locationText,
        reporterId: opt.reporterId || 'staff-village',
        reporterName: opt.reporterName || '李娜',
        reporterPhone: opt.reporterPhone || '13800000002',
        assigneeId: opt.assigneeId || '',
        assigneeName: opt.assigneeName || '',
        assigneePhone: opt.assigneePhone || '',
        measures: opt.measures || '',
        planDate: opt.planDate,
        status: opt.status,
        createdAt: opt.createdAt || agoDays(3),
        inspectionDate: opt.inspectionDate || toDateKeyFromIso(opt.createdAt || agoDays(3)),
        rectifyPhotos: opt.rectifyPhotos || [],
        rectifyAt: opt.rectifyAt || '',
        rectifyNote: opt.rectifyNote || '',
        reporterSignature: opt.reporterSignature || signPic('hsf-sign-' + opt.id),
        inspectionAllYes: opt.inspectionAllYes === true,
      };

      if (opt.type === 'well') issue.well = opt.block;
      else if (opt.type === 'road') issue.road = opt.block;
      else if (opt.type === 'bridge') issue.bridge = opt.block;
      else if (opt.type === 'forest') issue.forest = opt.block;
      else if (opt.type === 'transformer') issue.transformer = opt.block;

      if (opt.type === 'road' && opt.block) {
        issue.length = String(opt.block.length);
        issue.width = String(opt.block.width);
        issue.thickness = String(opt.block.thickness);
        issue.hasShoulder = opt.block.hasShoulder === 'yes' ? '是' : '否';
        issue.hasAsh = opt.block.hasAsh === 'yes' ? '是' : '否';
        issue.treeSurvive = String(opt.block.treeSurvive);
      }
      if (opt.type === 'bridge' && opt.block) {
        issue.bridgeKind = opt.block.kind;
        issue.bridgeKindLabel =
          opt.block.kind === 'bridge' ? '桥' : opt.block.kind === 'culvert' ? '涵' : '闸';
        issue.length = String(opt.block.length);
        issue.width = String(opt.block.width);
      }

      return issue;
    }

    var WELL_NAMES = {
      waterOut: '机井是否出水',
      pipeOk: '管道是否按要求连接',
      wiringOk: '走线是否规范',
      boxOk: '配电箱及电表等设施是否完好',
      coverOk: '井台、井盖是否完整',
      transformerOk: '变压器是否正常使用',
    };

    /* —— 机井 —— */
    var wellPendingQuiz = {
      waterOut: slot('yes', {
        photos: [pic('hsf-well-p-w1'), pic('hsf-well-p-w2')],
        photoProof: {
          firstCapturedAt: agoDays(2),
          lastCapturedAt: new Date(new Date(agoDays(2)).getTime() + 3 * 60 * 1000).toISOString(),
        },
      }),
      pipeOk: slot('no', {
        desc: '主管与支管接口松动，有渗水痕迹',
        photos: [pic('hsf-well-p-pipe1'), pic('hsf-well-p-pipe2')],
      }),
      wiringOk: slot('yes'),
      boxOk: slot('no', { photos: [pic('hsf-well-p-box1')] }),
      coverOk: slot('yes'),
      transformerOk: slot('yes'),
    };

    var wellInspectedQuiz1 = {
      waterOut: slot('yes', { photos: [pic('hsf-well-i1-w1'), pic('hsf-well-i1-w2')] }),
      pipeOk: slot('yes'),
      wiringOk: slot('yes'),
      boxOk: slot('yes'),
      coverOk: slot('yes'),
      transformerOk: slot('yes'),
    };

    var wellInspectedQuiz2 = {
      waterOut: slot('yes', { photos: [pic('hsf-well-i2-w1'), pic('hsf-well-i2-w2')] }),
      pipeOk: slot('yes'),
      wiringOk: slot('yes'),
      boxOk: slot('yes'),
      coverOk: slot('yes'),
      transformerOk: slot('yes'),
    };

    var wellDoneQuiz1 = {
      waterOut: slot('yes', { photos: [pic('hsf-well-d1-w1')] }),
      pipeOk: slot('yes'),
      wiringOk: slot('no', { desc: '线缆未套管固定' }),
      boxOk: slot('yes'),
      coverOk: slot('yes'),
      transformerOk: slot('yes'),
    };

    var wellDoneQuiz2 = {
      waterOut: slot('yes', { photos: [pic('hsf-well-d2-w1')] }),
      pipeOk: slot('yes'),
      wiringOk: slot('yes'),
      boxOk: slot('no', { desc: '箱门锈蚀', photos: [pic('hsf-well-d2-box1')] }),
      coverOk: slot('yes'),
      transformerOk: slot('yes'),
    };

    /* —— 道路 —— */
    var roadPendingQuiz = {
      hasShoulder: slot('no', { desc: '东侧路肩塌陷约 3 米' }),
      hasAsh: slot('yes'),
    };

    var roadInspectedQuiz1 = {
      hasShoulder: slot('yes'),
      hasAsh: slot('yes'),
    };

    var roadInspectedQuiz2 = {
      hasShoulder: slot('yes'),
      hasAsh: slot('yes'),
    };

    var roadDoneQuiz1 = {
      hasShoulder: slot('no', { desc: '路肩缺失', photos: [pic('hsf-road-d1-s1')] }),
      hasAsh: slot('yes'),
    };

    var roadDoneQuiz2 = {
      hasShoulder: slot('yes'),
      hasAsh: slot('no', { desc: '灰土层局部剥落', photos: [pic('hsf-road-d2-a1')] }),
    };

    /* —— 桥涵闸 —— */
    var bridgePendingQuiz = {
      needsRectify: slot('yes', {
        desc: '桥面伸缩缝开裂，栏杆螺栓松动',
        photos: [pic('hsf-bridge-p1'), pic('hsf-bridge-p2'), pic('hsf-bridge-p3')],
      }),
    };

    var bridgeInspectedQuiz = {
      needsRectify: slot('no'),
    };

    var bridgeDoneQuiz1 = {
      needsRectify: slot('yes', {
        desc: '涵洞进口淤积',
        photos: [pic('hsf-bridge-d1')],
      }),
    };

    var bridgeDoneQuiz2 = {
      needsRectify: slot('yes', { photos: [pic('hsf-bridge-d2')] }),
    };

    /* —— 林网 —— */
    var forestPendingQuiz = {
      brokenBelt: slot('no'),
      deadTrees: slot('yes', {
        desc: '南侧林带发现枯死杨树 4 株',
        photos: [pic('hsf-forest-p-dead1'), pic('hsf-forest-p-dead2')],
      }),
      pest: slot('no'),
    };

    var forestInspectedQuiz1 = {
      brokenBelt: slot('no'),
      deadTrees: slot('no'),
      pest: slot('no'),
    };

    var forestInspectedQuiz2 = {
      brokenBelt: slot('no'),
      deadTrees: slot('no'),
      pest: slot('no'),
    };

    var forestDoneQuiz1 = {
      brokenBelt: slot('yes', { desc: '田间路西侧林带断带 12 米', photos: [pic('hsf-forest-d1-b')] }),
      deadTrees: slot('no'),
      pest: slot('no'),
    };

    var forestDoneQuiz2 = {
      brokenBelt: slot('no'),
      deadTrees: slot('no'),
      pest: slot('yes', { desc: '发现天牛危害痕迹', photos: [pic('hsf-forest-d2-p')] }),
    };

    /* —— 变压器 —— */
    var tfPendingQuiz = {
      powered: slot('yes'),
      deviceOk: slot('no', { desc: '高压侧绝缘子有裂纹' }),
      cabinetOk: slot('yes'),
      illegalWire: slot('yes', { photos: [pic('hsf-tf-p-wire1')] }),
    };

    var tfInspectedQuiz1 = {
      powered: slot('yes'),
      deviceOk: slot('yes'),
      cabinetOk: slot('yes'),
      illegalWire: slot('no'),
    };

    var tfInspectedQuiz2 = {
      powered: slot('yes'),
      deviceOk: slot('yes'),
      cabinetOk: slot('yes'),
      illegalWire: slot('no'),
    };

    var tfDoneQuiz1 = {
      powered: slot('yes'),
      deviceOk: slot('no', { desc: '避雷器老化' }),
      cabinetOk: slot('yes'),
      illegalWire: slot('no'),
    };

    var tfDoneQuiz2 = {
      powered: slot('yes'),
      deviceOk: slot('yes'),
      cabinetOk: slot('no', { photos: [pic('hsf-tf-d2-cab')] }),
      illegalWire: slot('no'),
    };

    return [
      /* 机井 */
      baseIssue({
        id: 'issue-well-pending',
        type: 'well',
        street: '蒋官屯街道',
        village: '李官屯新村',
        naturalVillage: '蒋官屯村',
        projectYear: '2022',
        code: '机井01号',
        locationText: '李官屯新村东机耕路北侧',
        lat: 36.4567,
        lng: 115.9876,
        address: '山东省聊城市经济技术开发区蒋官屯街道李官屯新村',
        planDate: fmt(planOverdue),
        status: 'pending',
        createdAt: agoDays(5),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '更换井盖并规范管道连接',
        quizSteps: wellPendingQuiz,
        quizNames: WELL_NAMES,
        block: {
          buildKind: 'new',
          outletTotal: 4,
          outletDamaged: 1,
          casingTotal: 4,
          casingDamaged: 0,
          wellPlanDate: fmt(planOverdue),
          quizSteps: wellPendingQuiz,
          waterOut: 'yes',
          pipeOk: 'no',
          wiringOk: 'yes',
          boxOk: 'no',
          coverOk: 'yes',
          transformerOk: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-well-inspected-1',
        type: 'well',
        street: '蒋官屯街道',
        village: '中心社区',
        projectYear: '2023',
        code: '机井02号',
        locationText: '中心社区北地块机井',
        lat: 36.451,
        lng: 115.984,
        address: '山东省聊城市经济技术开发区蒋官屯街道中心社区',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(1),
        inspectionAllYes: true,
        quizSteps: wellInspectedQuiz1,
        quizNames: WELL_NAMES,
        block: {
          buildKind: 'match',
          outletTotal: 2,
          outletDamaged: 0,
          casingTotal: 2,
          casingDamaged: 0,
          wellPlanDate: fmt(planFar),
          quizSteps: wellInspectedQuiz1,
          waterOut: 'yes',
          pipeOk: 'yes',
          wiringOk: 'yes',
          boxOk: 'yes',
          coverOk: 'yes',
          transformerOk: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-well-inspected-2',
        type: 'well',
        street: '北城街道',
        village: '和谐新村',
        projectYear: '2021',
        code: '机井03号',
        locationText: '和谐新村西排灌站旁',
        lat: 36.468,
        lng: 115.972,
        address: '山东省聊城市经济技术开发区北城街道和谐新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(4),
        reporterId: 'staff-street',
        reporterName: '吴敏',
        reporterPhone: '13800000001',
        inspectionAllYes: true,
        quizSteps: wellInspectedQuiz2,
        quizNames: WELL_NAMES,
        block: {
          buildKind: 'new',
          outletTotal: 3,
          outletDamaged: 0,
          casingTotal: 3,
          casingDamaged: 0,
          wellPlanDate: fmt(planFar),
          quizSteps: wellInspectedQuiz2,
          waterOut: 'yes',
          pipeOk: 'yes',
          wiringOk: 'yes',
          boxOk: 'yes',
          coverOk: 'yes',
          transformerOk: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-well-done-1',
        type: 'well',
        street: '东城街道',
        village: '团结新村',
        projectYear: '2021',
        code: '机井04号',
        locationText: '团结新村西机井',
        lat: 36.44,
        lng: 116.01,
        address: '山东省聊城市经济技术开发区东城街道团结新村',
        planDate: fmt(new Date(doneThisYear.getTime() - 7 * 86400000)),
        status: 'done',
        createdAt: agoDays(20),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '重新理线并固定',
        quizSteps: wellDoneQuiz1,
        quizNames: WELL_NAMES,
        rectifyPhotos: [pic('hsf-well-d1-r1'), pic('hsf-well-d1-r2')],
        rectifyAt: doneThisYear.toISOString(),
        rectifyNote: '走线已套管固定，现场复核通过',
        block: {
          buildKind: 'new',
          outletTotal: 3,
          outletDamaged: 0,
          casingTotal: 3,
          casingDamaged: 0,
          wellPlanDate: fmt(new Date(doneThisYear.getTime() - 7 * 86400000)),
          quizSteps: wellDoneQuiz1,
          waterOut: 'yes',
          pipeOk: 'yes',
          wiringOk: 'no',
          boxOk: 'yes',
          coverOk: 'yes',
          transformerOk: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-well-done-2',
        type: 'well',
        street: '北城街道',
        village: '杨集新村',
        projectYear: '2022',
        code: '机井05号',
        locationText: '杨集新村北地块机井',
        lat: 36.472,
        lng: 115.96,
        address: '山东省聊城市经济技术开发区北城街道杨集新村',
        planDate: fmt(new Date(doneLastYear.getTime() - 10 * 86400000)),
        status: 'done',
        createdAt: new Date(doneLastYear.getTime() - 40 * 86400000).toISOString(),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '更换配电箱门',
        quizSteps: wellDoneQuiz2,
        quizNames: WELL_NAMES,
        rectifyPhotos: [pic('hsf-well-d2-r1')],
        rectifyAt: doneLastYear.toISOString(),
        rectifyNote: '箱门已更换，验收合格',
        block: {
          buildKind: 'match',
          outletTotal: 2,
          outletDamaged: 1,
          casingTotal: 2,
          casingDamaged: 0,
          wellPlanDate: fmt(new Date(doneLastYear.getTime() - 10 * 86400000)),
          quizSteps: wellDoneQuiz2,
          waterOut: 'yes',
          pipeOk: 'yes',
          wiringOk: 'yes',
          boxOk: 'no',
          coverOk: 'yes',
          transformerOk: 'yes',
        },
      }),

      /* 道路 */
      baseIssue({
        id: 'issue-road-pending',
        type: 'road',
        street: '蒋官屯街道',
        village: '冯庄新村',
        naturalVillage: '冯庄村',
        projectYear: '2021',
        code: '道路01号',
        locationText: '冯庄新村南主干道',
        lat: 36.4612,
        lng: 115.991,
        address: '山东省聊城市经济技术开发区蒋官屯街道冯庄新村',
        planDate: fmt(planSoon),
        status: 'pending',
        createdAt: agoDays(1),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '路肩回填夯实',
        quizSteps: roadPendingQuiz,
        quizNames: { hasShoulder: '是否有路肩', hasAsh: '是否有灰土层' },
        block: {
          length: 1.2,
          width: 4.5,
          thickness: 0.18,
          treeSurvive: 86,
          planDate: fmt(planSoon),
          quizSteps: roadPendingQuiz,
          hasShoulder: 'no',
          hasAsh: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-road-inspected-1',
        type: 'road',
        street: '蒋官屯街道',
        village: '海盛新村',
        naturalVillage: '贺海村',
        projectYear: '2023',
        code: '道路02号',
        locationText: '海盛新村东侧田间路',
        lat: 36.452,
        lng: 115.995,
        address: '山东省聊城市经济技术开发区蒋官屯街道海盛新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(2),
        inspectionAllYes: true,
        quizSteps: roadInspectedQuiz1,
        fallbackPhotos: [pic('hsf-road-i1')],
        block: {
          length: 0.8,
          width: 4.0,
          thickness: 0.16,
          treeSurvive: 120,
          planDate: fmt(planFar),
          quizSteps: roadInspectedQuiz1,
          hasShoulder: 'yes',
          hasAsh: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-road-inspected-2',
        type: 'road',
        street: '北城街道',
        village: '物流园社区',
        projectYear: '2022',
        code: '道路03号',
        locationText: '物流园社区北环路',
        lat: 36.465,
        lng: 115.968,
        address: '山东省聊城市经济技术开发区北城街道物流园社区',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(6),
        inspectionAllYes: true,
        quizSteps: roadInspectedQuiz2,
        fallbackPhotos: [pic('hsf-road-i2')],
        block: {
          length: 2.1,
          width: 5.0,
          thickness: 0.2,
          treeSurvive: 95,
          planDate: fmt(planFar),
          quizSteps: roadInspectedQuiz2,
          hasShoulder: 'yes',
          hasAsh: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-road-done-1',
        type: 'road',
        street: '蒋官屯街道',
        village: '程麻新村',
        naturalVillage: '麻庄村',
        projectYear: '2022',
        code: '道路04号',
        locationText: '程麻新村西生产路',
        lat: 36.4488,
        lng: 115.982,
        address: '山东省聊城市经济技术开发区蒋官屯街道程麻新村',
        planDate: fmt(new Date(doneThisYear.getTime() - 5 * 86400000)),
        status: 'done',
        createdAt: agoDays(18),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '路肩回填夯实',
        quizSteps: roadDoneQuiz1,
        rectifyPhotos: [pic('hsf-road-d1-r')],
        rectifyAt: doneThisYear.toISOString(),
        rectifyNote: '路肩已回填夯实，平整度合格',
        block: {
          length: 1.5,
          width: 4.2,
          thickness: 0.18,
          treeSurvive: 78,
          planDate: fmt(new Date(doneThisYear.getTime() - 5 * 86400000)),
          quizSteps: roadDoneQuiz1,
          hasShoulder: 'no',
          hasAsh: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-road-done-2',
        type: 'road',
        street: '东城街道',
        village: '李太屯社区',
        projectYear: '2020',
        code: '道路05号',
        locationText: '李太屯社区南支路',
        lat: 36.438,
        lng: 116.005,
        address: '山东省聊城市经济技术开发区东城街道李太屯社区',
        planDate: fmt(new Date(doneLastYear.getTime() - 8 * 86400000)),
        status: 'done',
        createdAt: new Date(doneLastYear.getTime() - 35 * 86400000).toISOString(),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '灰土层修补',
        quizSteps: roadDoneQuiz2,
        rectifyPhotos: [pic('hsf-road-d2-r1'), pic('hsf-road-d2-r2')],
        rectifyAt: doneLastYear.toISOString(),
        rectifyNote: '灰土层已修补压实',
        block: {
          length: 0.6,
          width: 3.5,
          thickness: 0.15,
          treeSurvive: 64,
          planDate: fmt(new Date(doneLastYear.getTime() - 8 * 86400000)),
          quizSteps: roadDoneQuiz2,
          hasShoulder: 'yes',
          hasAsh: 'no',
        },
      }),

      /* 桥涵闸 */
      baseIssue({
        id: 'issue-bridge-pending',
        type: 'bridge',
        street: '蒋官屯街道',
        village: '程麻新村',
        naturalVillage: '老程庄村',
        projectYear: '2022',
        code: '桥涵闸01号',
        locationText: '程麻新村西排灌沟桥',
        lat: 36.449,
        lng: 115.981,
        address: '山东省聊城市经济技术开发区蒋官屯街道程麻新村',
        planDate: fmt(planHours),
        status: 'pending',
        createdAt: agoDays(0.2),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '加固栏杆并修补桥面',
        quizSteps: bridgePendingQuiz,
        quizNames: { needsRectify: '是否需要整改' },
        block: {
          kind: 'bridge',
          length: 12,
          width: 4,
          planDate: fmt(planHours),
          quizSteps: bridgePendingQuiz,
          needsRectify: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-bridge-inspected-1',
        type: 'bridge',
        street: '蒋官屯街道',
        village: '滨河社区',
        projectYear: '2023',
        code: '桥涵闸02号',
        locationText: '滨河社区排涝涵洞',
        lat: 36.453,
        lng: 115.979,
        address: '山东省聊城市经济技术开发区蒋官屯街道滨河社区',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(3),
        inspectionAllYes: true,
        quizSteps: bridgeInspectedQuiz,
        fallbackPhotos: [pic('hsf-bridge-i1')],
        block: {
          kind: 'culvert',
          length: 8,
          width: 2.5,
          planDate: fmt(planFar),
          quizSteps: bridgeInspectedQuiz,
          needsRectify: 'no',
        },
      }),
      baseIssue({
        id: 'issue-bridge-inspected-2',
        type: 'bridge',
        street: '北城街道',
        village: '孙屯新村',
        projectYear: '2021',
        code: '桥涵闸03号',
        locationText: '孙屯新村灌溉闸',
        lat: 36.47,
        lng: 115.965,
        address: '山东省聊城市经济技术开发区北城街道孙屯新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(7),
        inspectionAllYes: true,
        quizSteps: bridgeInspectedQuiz,
        fallbackPhotos: [pic('hsf-bridge-i2')],
        block: {
          kind: 'gate',
          length: 6,
          width: 3,
          planDate: fmt(planFar),
          quizSteps: bridgeInspectedQuiz,
          needsRectify: 'no',
        },
      }),
      baseIssue({
        id: 'issue-bridge-done-1',
        type: 'bridge',
        street: '蒋官屯街道',
        village: '久安新村',
        naturalVillage: '安庄村',
        projectYear: '2022',
        code: '桥涵闸04号',
        locationText: '久安新村生产桥',
        lat: 36.447,
        lng: 115.988,
        address: '山东省聊城市经济技术开发区蒋官屯街道久安新村',
        planDate: fmt(new Date(doneThisYear.getTime() - 6 * 86400000)),
        status: 'done',
        createdAt: agoDays(16),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '清淤疏通涵洞',
        quizSteps: bridgeDoneQuiz1,
        rectifyPhotos: [pic('hsf-bridge-d1-r')],
        rectifyAt: doneThisYear.toISOString(),
        rectifyNote: '涵洞清淤完成，排水正常',
        block: {
          kind: 'culvert',
          length: 10,
          width: 2.8,
          planDate: fmt(new Date(doneThisYear.getTime() - 6 * 86400000)),
          quizSteps: bridgeDoneQuiz1,
          needsRectify: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-bridge-done-2',
        type: 'bridge',
        street: '东城街道',
        village: '大胡社区',
        projectYear: '2020',
        code: '桥涵闸05号',
        locationText: '大胡社区田间闸',
        lat: 36.442,
        lng: 116.008,
        address: '山东省聊城市经济技术开发区东城街道大胡社区',
        planDate: fmt(new Date(doneLastYear.getTime() - 12 * 86400000)),
        status: 'done',
        createdAt: new Date(doneLastYear.getTime() - 38 * 86400000).toISOString(),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '闸板除锈上漆',
        quizSteps: bridgeDoneQuiz2,
        rectifyPhotos: [pic('hsf-bridge-d2-r')],
        rectifyAt: doneLastYear.toISOString(),
        rectifyNote: '闸板维护完成',
        block: {
          kind: 'gate',
          length: 5,
          width: 2.5,
          planDate: fmt(new Date(doneLastYear.getTime() - 12 * 86400000)),
          quizSteps: bridgeDoneQuiz2,
          needsRectify: 'yes',
        },
      }),

      /* 林网 */
      baseIssue({
        id: 'issue-forest-pending',
        type: 'forest',
        street: '蒋官屯街道',
        village: '泰和新村',
        naturalVillage: '姜庄村',
        projectYear: '2022',
        code: '林网01号',
        locationText: '泰和新村南侧林带',
        lat: 36.455,
        lng: 115.993,
        address: '山东省聊城市经济技术开发区蒋官屯街道泰和新村',
        planDate: fmt(planSoon),
        status: 'pending',
        createdAt: agoDays(2),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '清除枯死木并补植',
        quizSteps: forestPendingQuiz,
        quizNames: {
          brokenBelt: '林带是否断带',
          deadTrees: '是否有枯死木',
          pest: '是否发现病虫害',
        },
        block: {
          handoverCount: 1200,
          existingCount: 1150,
          surviveRate: 92,
          planDate: fmt(planSoon),
          quizSteps: forestPendingQuiz,
          brokenBelt: 'no',
          deadTrees: 'yes',
          pest: 'no',
        },
      }),
      baseIssue({
        id: 'issue-forest-inspected-1',
        type: 'forest',
        street: '蒋官屯街道',
        village: '河东新村',
        naturalVillage: '前铺村',
        projectYear: '2023',
        code: '林网02号',
        locationText: '河东新村东侧防护林',
        lat: 36.45,
        lng: 115.99,
        address: '山东省聊城市经济技术开发区蒋官屯街道河东新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(1),
        inspectionAllYes: true,
        quizSteps: forestInspectedQuiz1,
        fallbackPhotos: [pic('hsf-forest-i1')],
        block: {
          handoverCount: 800,
          existingCount: 790,
          surviveRate: 96,
          planDate: fmt(planFar),
          quizSteps: forestInspectedQuiz1,
          brokenBelt: 'no',
          deadTrees: 'no',
          pest: 'no',
        },
      }),
      baseIssue({
        id: 'issue-forest-inspected-2',
        type: 'forest',
        street: '北城街道',
        village: '常楼新村',
        projectYear: '2021',
        code: '林网03号',
        locationText: '常楼新村道路两侧林网',
        lat: 36.466,
        lng: 115.97,
        address: '山东省聊城市经济技术开发区北城街道常楼新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(5),
        inspectionAllYes: true,
        quizSteps: forestInspectedQuiz2,
        fallbackPhotos: [pic('hsf-forest-i2')],
        block: {
          handoverCount: 1500,
          existingCount: 1420,
          surviveRate: 88,
          planDate: fmt(planFar),
          quizSteps: forestInspectedQuiz2,
          brokenBelt: 'no',
          deadTrees: 'no',
          pest: 'no',
        },
      }),
      baseIssue({
        id: 'issue-forest-done-1',
        type: 'forest',
        street: '蒋官屯街道',
        village: '海盛新村',
        naturalVillage: '季海村',
        projectYear: '2022',
        code: '林网04号',
        locationText: '海盛新村西侧林带',
        lat: 36.4515,
        lng: 115.9945,
        address: '山东省聊城市经济技术开发区蒋官屯街道海盛新村',
        planDate: fmt(new Date(doneThisYear.getTime() - 4 * 86400000)),
        status: 'done',
        createdAt: agoDays(14),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '林带断带补植',
        quizSteps: forestDoneQuiz1,
        rectifyPhotos: [pic('hsf-forest-d1-r')],
        rectifyAt: doneThisYear.toISOString(),
        rectifyNote: '断带段已补植杨树 20 株',
        block: {
          handoverCount: 600,
          existingCount: 580,
          surviveRate: 90,
          planDate: fmt(new Date(doneThisYear.getTime() - 4 * 86400000)),
          quizSteps: forestDoneQuiz1,
          brokenBelt: 'yes',
          deadTrees: 'no',
          pest: 'no',
        },
      }),
      baseIssue({
        id: 'issue-forest-done-2',
        type: 'forest',
        street: '东城街道',
        village: '辛屯社区',
        projectYear: '2020',
        code: '林网05号',
        locationText: '辛屯社区北侧林网',
        lat: 36.436,
        lng: 116.002,
        address: '山东省聊城市经济技术开发区东城街道辛屯社区',
        planDate: fmt(new Date(doneLastYear.getTime() - 9 * 86400000)),
        status: 'done',
        createdAt: new Date(doneLastYear.getTime() - 32 * 86400000).toISOString(),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '病虫害防治',
        quizSteps: forestDoneQuiz2,
        rectifyPhotos: [pic('hsf-forest-d2-r1'), pic('hsf-forest-d2-r2')],
        rectifyAt: doneLastYear.toISOString(),
        rectifyNote: '已喷洒药剂，后续继续观察',
        block: {
          handoverCount: 950,
          existingCount: 900,
          surviveRate: 85,
          planDate: fmt(new Date(doneLastYear.getTime() - 9 * 86400000)),
          quizSteps: forestDoneQuiz2,
          brokenBelt: 'no',
          deadTrees: 'no',
          pest: 'yes',
        },
      }),

      /* 变压器 */
      baseIssue({
        id: 'issue-tf-pending',
        type: 'transformer',
        street: '蒋官屯街道',
        village: '李官屯新村',
        naturalVillage: '王行村',
        projectYear: '2022',
        code: '变压器01号',
        locationText: '李官屯新村配电房',
        lat: 36.457,
        lng: 115.986,
        address: '山东省聊城市经济技术开发区蒋官屯街道李官屯新村',
        planDate: fmt(planOverdue),
        status: 'pending',
        createdAt: agoDays(4),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '更换绝缘子并清理私拉线路',
        quizSteps: tfPendingQuiz,
        quizNames: {
          powered: '是否通电',
          deviceOk: '设备是否完好',
          cabinetOk: '配电设施是否完好',
          illegalWire: '是否私拉乱接',
        },
        block: {
          capacity: 200,
          model: 'S11-M-200/10',
          voltage: '10kv',
          planDate: fmt(planOverdue),
          quizSteps: tfPendingQuiz,
          powered: 'yes',
          deviceOk: 'no',
          cabinetOk: 'yes',
          illegalWire: 'yes',
        },
      }),
      baseIssue({
        id: 'issue-tf-inspected-1',
        type: 'transformer',
        street: '蒋官屯街道',
        village: '冯庄新村',
        naturalVillage: '四合村',
        projectYear: '2023',
        code: '变压器02号',
        locationText: '冯庄新村东台区',
        lat: 36.462,
        lng: 115.992,
        address: '山东省聊城市经济技术开发区蒋官屯街道冯庄新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(2),
        inspectionAllYes: true,
        quizSteps: tfInspectedQuiz1,
        fallbackPhotos: [pic('hsf-tf-i1')],
        block: {
          capacity: 315,
          model: 'S13-M-315/10',
          voltage: '10kv',
          planDate: fmt(planFar),
          quizSteps: tfInspectedQuiz1,
          powered: 'yes',
          deviceOk: 'yes',
          cabinetOk: 'yes',
          illegalWire: 'no',
        },
      }),
      baseIssue({
        id: 'issue-tf-inspected-2',
        type: 'transformer',
        street: '北城街道',
        village: '河刘新村',
        projectYear: '2021',
        code: '变压器03号',
        locationText: '河刘新村灌溉台区',
        lat: 36.469,
        lng: 115.963,
        address: '山东省聊城市经济技术开发区北城街道河刘新村',
        planDate: fmt(planFar),
        status: 'inspected',
        createdAt: agoDays(8),
        inspectionAllYes: true,
        quizSteps: tfInspectedQuiz2,
        fallbackPhotos: [pic('hsf-tf-i2')],
        block: {
          capacity: 100,
          model: 'S11-M-100/10',
          voltage: '0.4kv',
          planDate: fmt(planFar),
          quizSteps: tfInspectedQuiz2,
          powered: 'yes',
          deviceOk: 'yes',
          cabinetOk: 'yes',
          illegalWire: 'no',
        },
      }),
      baseIssue({
        id: 'issue-tf-done-1',
        type: 'transformer',
        street: '蒋官屯街道',
        village: '程麻新村',
        naturalVillage: '麻庄村',
        projectYear: '2022',
        code: '变压器04号',
        locationText: '程麻新村排灌站配电室',
        lat: 36.4485,
        lng: 115.983,
        address: '山东省聊城市经济技术开发区蒋官屯街道程麻新村',
        planDate: fmt(new Date(doneThisYear.getTime() - 3 * 86400000)),
        status: 'done',
        createdAt: agoDays(12),
        assigneeId: 'staff-fixer',
        assigneeName: '王建华',
        assigneePhone: '13800000003',
        measures: '更换避雷器',
        quizSteps: tfDoneQuiz1,
        rectifyPhotos: [pic('hsf-tf-d1-r')],
        rectifyAt: doneThisYear.toISOString(),
        rectifyNote: '避雷器已更换，绝缘测试合格',
        block: {
          capacity: 250,
          model: 'S11-M-250/10',
          voltage: '10kv',
          planDate: fmt(new Date(doneThisYear.getTime() - 3 * 86400000)),
          quizSteps: tfDoneQuiz1,
          powered: 'yes',
          deviceOk: 'no',
          cabinetOk: 'yes',
          illegalWire: 'no',
        },
      }),
      baseIssue({
        id: 'issue-tf-done-2',
        type: 'transformer',
        street: '东城街道',
        village: '光岳社区',
        projectYear: '2020',
        code: '变压器05号',
        locationText: '光岳社区低压配电箱',
        lat: 36.441,
        lng: 116.006,
        address: '山东省聊城市经济技术开发区东城街道光岳社区',
        planDate: fmt(new Date(doneLastYear.getTime() - 11 * 86400000)),
        status: 'done',
        createdAt: new Date(doneLastYear.getTime() - 30 * 86400000).toISOString(),
        assigneeId: 'staff-admin',
        assigneeName: '李强',
        assigneePhone: '13800000000',
        measures: '配电箱维修',
        quizSteps: tfDoneQuiz2,
        rectifyPhotos: [pic('hsf-tf-d2-r1'), pic('hsf-tf-d2-r2')],
        rectifyAt: doneLastYear.toISOString(),
        rectifyNote: '配电箱门锁及接地已修复',
        block: {
          capacity: 160,
          model: 'S11-M-160/10',
          voltage: '0.4kv',
          planDate: fmt(new Date(doneLastYear.getTime() - 11 * 86400000)),
          quizSteps: tfDoneQuiz2,
          powered: 'yes',
          deviceOk: 'yes',
          cabinetOk: 'no',
          illegalWire: 'no',
        },
      }),
    ];
  }

  global.HSFIssuesSeed = {
    build: buildIssuesSeed,
    VERSION: 'issues-seed-v20',
  };
})(window);
