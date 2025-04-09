javascript:(function(){
    
    // 기존 옵저버 정리
    if (window.existingModalObserver) {
        window.existingModalObserver.disconnect();
        window.existingModalObserver = null;
    }
    
    // 북마클릿 코드 전체를 페이지에 저장 (재실행용)
    if (!document.getElementById('article-id-bookmarklet-code')) {
        const codeStorage = document.createElement('script');
        codeStorage.id = 'article-id-bookmarklet-code';
        codeStorage.type = 'text/plain';
        codeStorage.style.display = 'none';
        codeStorage.textContent = arguments.callee.toString();
        document.body.appendChild(codeStorage);
    } else {
        // 기존 코드 업데이트
        document.getElementById('article-id-bookmarklet-code').textContent = arguments.callee.toString();
    }
    
    // 전역 변수 설정
    window.lastNetworkSetId = '';
    window.downloadPending = false;
    window.modalFound = false;
    window.lastExamNm = '';
    
    console.log('북마클릿 시작. 버전: 개선된 타이틀 추출');
    
    // 기본 변수 설정
    const containers = document.querySelectorAll('kv-result-container');
    if (containers.length === 0) {
        alert('이 페이지에서는 Article ID를 찾을 수 없습니다.');
        window.articleIdBookmarkletRunning = false;
        return;
    }
    
    // 이전에 생성된 라벨 제거
    let existingLabels = document.querySelectorAll('.article-id-label');
    existingLabels.forEach(el => el.remove());
    
    // 상단 배너 제거
    const topBanner = document.getElementById('article-id-top-banner');
    if (topBanner) {
        document.body.removeChild(topBanner);
    }
    
    // 세트 ID 초기화 (우측 화면과 같이 작동 시 setId를 사용)
    let setId = '';
    if (containers.length > 0) {
        setId = containers[0].getAttribute('set_id') || '';
    }
    
    // Article ID 배열 초기화 및 중복 처리 방지용 Set
    const processedContainers = new Set();
    let addedCount = 0;
    
    // 파일명에서 유효하지 않은 문자를 제거하는 함수
    function sanitizeFileName(fileName) {
        return fileName.replace(/[\\/:*?"<>|]/g, '_');
    }
    
    // CSV 파일로 아티클 ID 다운로드 함수
    function downloadArticleIdsAsCsv(fileName, articleIds) {
        console.log('다운로드 시작, 파일명:', fileName);
        
        // 파일명 정리 (유효하지 않은 문자 제거)
        fileName = sanitizeFileName(fileName);
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const csvContent = ['순번,Article ID'];
        
        articleIds.forEach((item, idx) => {
            if (typeof item === 'object' && item.id) {
                csvContent.push(`${item.index},${item.id}`);
            } else {
                csvContent.push(`${idx + 1},${item}`);
            }
        });
        
        const csvString = csvContent.join('\n');
        const blob = new Blob([bom, csvString], {type: 'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${fileName || 'article_ids'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`CSV 파일 다운로드 완료: ${fileName}.csv (${articleIds.length}개 아티클)`);
    }
    
    // 상단 배너 생성 - 투명도 적용
    const setIdBanner = document.createElement('div');
    setIdBanner.id = 'article-id-top-banner';
    setIdBanner.style.position = 'fixed';
    setIdBanner.style.top = '0';
    setIdBanner.style.left = '0';
    setIdBanner.style.width = '100%';
    setIdBanner.style.background = 'rgba(74, 144, 226, 0.60)'; // 배경색에 알파값 0.60 적용 (약간 투명)
    setIdBanner.style.color = 'white';
    setIdBanner.style.padding = '8px';
    setIdBanner.style.zIndex = '9999';
    setIdBanner.style.textAlign = 'center';
    setIdBanner.style.fontWeight = 'bold';
    setIdBanner.style.backdropFilter = 'blur(2px)'; // 배경 흐림 효과 (모던 브라우저에서만 작동)
    
    // 공통 버튼 스타일
    const commonButtonStyle = `
        background: #fff;
        color: #3a7bd5;
        border: 2px solid #3a7bd5;
        padding: 4px 12px;
        border-radius: 4px;
        margin-left: 10px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
    `;
    
    // 타이틀 가져오기 (개선된 버전)
    function getTitle() {
        // 가능한 모든 타이틀 요소 선택자
        const selectors = [
            // 입력 필드 (자료명, 등)
            '.searchbar .keyword input[type="text"]',
            '#partTitle', 
            'input[name="partTitle"]',
            '.text-box.text_edit input',
            
            // 텍스트 요소들
            '.data-title', 
            '.data-title button',
            '.detail-data-title input', 
            '.data-head .data-title',
            '.published-detail__header .title',
            '.header-title .title',
            '.headerTitle .dataTitle',
            '.data-title-wrap h3',
            '.search-form-inner.detail-search-form input',
            '.header-row.header-title span'
        ];
        
        let titleText = '';
        let source = '';
        
        // 먼저 네트워크 요청에서 캡처된 examNm 확인
        if (window.lastExamNm) {
            titleText = window.lastExamNm;
            console.log('네트워크 요청에서 examNm 발견:', titleText);
            return titleText;
        }
        
        // 각 선택자에서 타이틀 찾기 시도
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            
            for (const element of elements) {
                let text = '';
                
                if (element.tagName === 'INPUT') {
                    text = element.value;
                } else if (element.tagName === 'BUTTON') {
                    text = element.textContent;
                } else {
                    text = element.textContent;
                }
                
                if (text && text.trim() && text.trim() !== '자료명 *') {
                    titleText = text.trim();
                    source = selector;
                    console.log(`타이틀 발견 (${selector}):`, titleText);
                    return titleText;
                }
            }
        }
        
        // 부분적 일치 - 다양한 HTML 구조 대응
        if (!titleText) {
            // 중첩된 구조 처리
            const nestedElements = [
                document.querySelector('.data-title'),
                document.querySelector('.detail-data-title'),
                document.querySelector('.header-title'),
                document.querySelector('.headerTitle')
            ];
            
            for (const element of nestedElements) {
                if (element) {
                    const input = element.querySelector('input[type="text"]');
                    if (input && input.value) {
                        titleText = input.value.trim();
                        console.log('중첩 구조에서 타이틀 발견:', titleText);
                        return titleText;
                    }
                    
                    // 텍스트 노드 확인
                    const textContent = element.textContent.trim();
                    if (textContent) {
                        titleText = textContent;
                        console.log('중첩 구조의 텍스트에서 타이틀 발견:', titleText);
                        return titleText;
                    }
                }
            }
        }
        
        return titleText;
    }
    
    // 현재 페이지의 타이틀 가져오기
    const pageTitle = getTitle();
    
    // Set ID가 있는 경우 (SET ID, 복사 기능, 엑셀 다운로드, 재실행 버튼, 닫기 버튼 표시)
    if (setId) {
        setIdBanner.innerHTML = 
            `<span>SET ID: </span>
             <span id="copyableSetId" style="cursor:pointer;text-decoration:underline;">${setId}</span> 
             (클릭하여 복사)
             <span style="margin-left:15px;">타이틀: </span>
             <span id="pageTitleSpan">${pageTitle || '(없음)'}</span>
             <button id="downloadCsvBtn" style="${commonButtonStyle}">엑셀 다운로드</button> 
             <button id="rerunBtnTop" style="${commonButtonStyle}">⟲ 재실행</button>
             <button id="closeBannerBtn" style="${commonButtonStyle}">닫기</button>`;
    } 
    // Set ID가 없는 경우 (재실행 안내 문구와 재실행 버튼 표시)
    else {
        setIdBanner.innerHTML = 
            `<span style="margin-right:15px;color:#ffffff;">문항을 수정하신 경우, '재실행' 버튼을 눌러 다시 추출해주세요.</span>
             <span style="margin-left:15px;">타이틀: </span>
             <span id="pageTitleSpan">${pageTitle || '(없음)'}</span>
             <button id="rerunBtnTop" style="${commonButtonStyle}">⟲ 재실행</button>
             <button id="closeBannerBtn" style="${commonButtonStyle}">닫기</button>`;
    }
    
    document.body.appendChild(setIdBanner);
    
    // setId가 있는 경우 복사 기능 추가
    if (setId) {
        document.getElementById('copyableSetId').addEventListener('click', function() {
            navigator.clipboard.writeText(setId)
                .then(() => {
                    alert('Set ID가 클립보드에 복사되었습니다: ' + setId);
                })
                .catch(err => {
                    // 폴백: document.execCommand 사용
                    const textArea = document.createElement('textarea');
                    textArea.value = setId;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('Set ID가 클립보드에 복사되었습니다: ' + setId);
                });
        });
        
        // CSV 다운로드 버튼 (우측 영역 또는 전체 kv-result-container를 대상으로 CSV 다운로드)
        document.getElementById('downloadCsvBtn').addEventListener('click', function() {
            // 우선 우측 영역(.datas-right) 내 컨테이너를 찾고, 없으면 전체 컨테이너를 대상으로 함
            const rightSideContainers = document.querySelectorAll('.datas-right kv-result-container');
            const containersList = rightSideContainers.length > 0 ? rightSideContainers : document.querySelectorAll('kv-result-container');
            
            console.log('다운로드 대상 컨테이너 개수:', containersList.length);
            const ids = [];
            
            containersList.forEach((container, index) => {
                const articleId = container.getAttribute('article_id');
                if (articleId) {
                    ids.push({index: index + 1, id: articleId});
                }
            });
            
            if (ids.length === 0) {
                alert("다운로드할 Article ID가 없습니다.");
                return;
            }
            
            // 페이지 타이틀 가져오기
            const currentTitle = getTitle();
            
            // 파일명 생성: SET ID_타이틀 형식 또는 사용 가능한 옵션
            let fileName = 'article_ids';
            if (setId && currentTitle) {
                fileName = `${setId}_${currentTitle}`;
            } else if (setId) {
                fileName = setId;
            } else if (currentTitle) {
                fileName = currentTitle;
            }
            
            downloadArticleIdsAsCsv(fileName, ids);
        });
    }
    
    // 재실행 버튼 (항상 추가) - 글로우 효과 추가
    const rerunBtn = document.getElementById('rerunBtnTop');
    rerunBtn.addEventListener('click', function() {
        alert("Article ID를 다시 추출합니다.");
        // 코드 저장 요소에서 북마클릿 코드를 가져와 실행
        if (document.getElementById('article-id-bookmarklet-code')) {
            try {
                const bookmarkletCode = document.getElementById('article-id-bookmarklet-code').textContent;
                const bookmarkletFunction = new Function('return ' + bookmarkletCode)();
                bookmarkletFunction();
            } catch (e) {
                console.error('재실행 오류:', e);
                alert('재실행 중 오류가 발생했습니다. F12를 눌러 콘솔 로그를 확인하세요.');
            }
        } else {
            alert('저장된 북마클릿 코드를 찾을 수 없습니다. 북마클릿을 다시 실행해주세요.');
        }
    });
    
    // 글로우 효과를 위한 이벤트 리스너 추가 (재실행 버튼에만 적용)
    rerunBtn.addEventListener('mouseover', function() {
        this.style.background = '#3a7bd5';
        this.style.color = '#fff';
        this.style.boxShadow = '0 0 15px rgba(58, 123, 213, 0.6)';
    });
    
    rerunBtn.addEventListener('mouseout', function() {
        this.style.background = '#fff';
        this.style.color = '#3a7bd5';
        this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    });
    
    // 배너 닫기 버튼 (항상 표시)
    document.getElementById('closeBannerBtn').addEventListener('click', function() {
        const banner = document.getElementById('article-id-top-banner');
        if (banner) {
            document.body.removeChild(banner);
        }
    });
    
    // Fetch API 모니터링 (저장 관련 요청 감지)
    (function() {
        const originalFetch = window.fetch;
        window.fetch = async function() {
            const url = arguments[0];
            const options = arguments[1] || {};
            
            // 저장 요청에 examNm이 있는지 확인 (POST 요청의 본문)
            if (options && options.body && typeof options.body === 'string') {
                try {
                    const bodyData = JSON.parse(options.body);
                    if (bodyData && bodyData.examNm) {
                        window.lastExamNm = bodyData.examNm;
                        console.log('요청 본문에서 examNm 발견:', window.lastExamNm);
                        
                        // 타이틀 스팬 업데이트
                        const titleSpan = document.getElementById('pageTitleSpan');
                        if (titleSpan) {
                            titleSpan.textContent = window.lastExamNm;
                        }
                    }
                } catch (e) {
                    // JSON 파싱 오류는 무시
                }
            }
            
            const response = await originalFetch.apply(this, arguments);
            
            if ((typeof url === 'string' && 
                (url.includes('/sets/save') || 
                 url.includes('setSummaryForSave') || 
                 url.includes('/api/') || 
                 url.includes('/save'))) ||
                (options.method === 'POST' || options.method === 'post')) {
                
                console.log('fetch 요청 감지:', url);
                const clone = response.clone();
                clone.json().then(data => {
                    console.log('fetch 응답:', data);
                    let setsId = null;
                    if (data && data.paramData && data.paramData.setsId) {
                        setsId = data.paramData.setsId;
                        console.log('fetch 응답에서 paramData.setsId 발견:', setsId);
                    } else if (data && data.setsId) {
                        setsId = data.setsId;
                        console.log('fetch 응답에서 setsId 발견:', setsId);
                    } else if (data && data.resultData && data.resultData.setsId) {
                        setsId = data.resultData.setsId;
                        console.log('fetch 응답에서 resultData.setsId 발견:', setsId);
                    }
                    
                    // examNm 확인
                    if (data && data.examNm) {
                        window.lastExamNm = data.examNm;
                        console.log('fetch 응답에서 examNm 발견:', window.lastExamNm);
                        
                        // 타이틀 스팬 업데이트
                        const titleSpan = document.getElementById('pageTitleSpan');
                        if (titleSpan) {
                            titleSpan.textContent = window.lastExamNm;
                        }
                    }
                    
                    if (setsId) {
                        window.lastNetworkSetId = setsId;
                        const copyableSetId = document.getElementById('copyableSetId');
                        if (copyableSetId) {
                            copyableSetId.textContent = window.lastNetworkSetId;
                            setId = window.lastNetworkSetId;
                        }
                    }
                }).catch(err => {
                    console.log('fetch 응답 처리 오류:', err);
                });
            }
            
            return response;
        };
    })();
    
    // XMLHttpRequest 인터셉터 (저장 관련 요청 감시)
    (function() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function() {
            this._url = arguments[1] || '';
            this._method = arguments[0] || '';
            return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
            // 요청 본문에서 examNm 확인
            if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].includes('examNm')) {
                try {
                    const bodyData = JSON.parse(arguments[0]);
                    if (bodyData && bodyData.examNm) {
                        window.lastExamNm = bodyData.examNm;
                        console.log('XHR 요청 본문에서 examNm 발견:', window.lastExamNm);
                        
                        // 타이틀 스팬 업데이트
                        const titleSpan = document.getElementById('pageTitleSpan');
                        if (titleSpan) {
                            titleSpan.textContent = window.lastExamNm;
                        }
                    }
                } catch (e) {
                    // JSON 파싱 오류는 무시
                }
            }
            
            if (this._method.toLowerCase() === 'post' && 
                typeof this._url === 'string' && 
                (this._url.includes('/sets/save') || 
                 this._url.includes('setSummaryForSave') || 
                 this._url.includes('/api/') || 
                 this._url.includes('/save'))) {
                
                console.log('XHR 요청 감지:', this._url);
                this.addEventListener('load', function() {
                    if (this.responseText) {
                        try {
                            const data = JSON.parse(this.responseText);
                            console.log('XHR 응답:', data);
                            let setsId = null;
                            if (data && data.paramData && data.paramData.setsId) {
                                setsId = data.paramData.setsId;
                                console.log('XHR 응답에서 paramData.setsId 발견:', setsId);
                            } else if (data && data.setsId) {
                                setsId = data.setsId;
                                console.log('XHR 응답에서 setsId 발견:', setsId);
                            } else if (data && data.resultData && data.resultData.setsId) {
                                setsId = data.resultData.setsId;
                                console.log('XHR 응답에서 resultData.setsId 발견:', setsId);
                            }
                            
                            // examNm 확인
                            if (data && data.examNm) {
                                window.lastExamNm = data.examNm;
                                console.log('XHR 응답에서 examNm 발견:', window.lastExamNm);
                                
                                // 타이틀 스팬 업데이트
                                const titleSpan = document.getElementById('pageTitleSpan');
                                if (titleSpan) {
                                    titleSpan.textContent = window.lastExamNm;
                                }
                            }
                            
                            if (setsId) {
                                window.lastNetworkSetId = setsId;
                                const copyableSetId = document.getElementById('copyableSetId');
                                if (copyableSetId) {
                                    copyableSetId.textContent = window.lastNetworkSetId;
                                    setId = window.lastNetworkSetId;
                                }
                            }
                        } catch (e) {
                            console.log('XHR 응답 파싱 오류:', e);
                        }
                    }
                });
            }
            return originalSend.apply(this, arguments);
        };
    })();
    
    // 저장 버튼에 직접 이벤트 리스너 추가
    const saveButton = document.querySelector('.btn-save');
    if (saveButton) {
        console.log('저장 버튼 발견, 이벤트 리스너 추가 (화면 내 전체 CSV 다운로드)');
        saveButton.addEventListener('click', function() {
            console.log('저장 버튼 클릭 감지!');
            
            // 자료명 입력 필드에서 타이틀 확인 (저장 시점에 최신 타이틀 가져오기)
            const titleInput = document.querySelector('.searchbar .keyword input[type="text"]');
            if (titleInput && titleInput.value.trim()) {
                window.lastExamNm = titleInput.value.trim();
                console.log('저장 버튼 클릭 시 자료명에서 타이틀 발견:', window.lastExamNm);
                
                // 타이틀 스팬 업데이트
                const titleSpan = document.getElementById('pageTitleSpan');
                if (titleSpan) {
                    titleSpan.textContent = window.lastExamNm;
                }
            }
            
            // 수정: 모든 컨테이너 대상으로 수집 (우측 영역 제한 제거)
            const allContainers = document.querySelectorAll('kv-result-container');
            console.log('CSV 다운로드 시작, 컨테이너 개수:', allContainers.length);
            
            const articleIds = [];
            allContainers.forEach((container, index) => {
                const articleId = container.getAttribute('article_id');
                if (articleId) {
                    articleIds.push({index: index + 1, id: articleId});
                }
            });
            
            if (articleIds.length === 0) {
                alert("저장할 Article ID가 없습니다.");
                return;
            }
            
            // 파일명: SET ID_타이틀 형식으로 설정
            let fileName = "article_ids";
            
            // 현재 SET ID 확인
            const currentSetId = window.lastNetworkSetId || 
                                (allContainers.length > 0 ? allContainers[0].getAttribute('set_id') : '');
            
            // 현재 타이틀 확인 (네트워크 요청에서 캡처된 타이틀 우선)
            const currentTitle = window.lastExamNm || getTitle();
            
            // 파일명 생성 로직
            if (currentSetId && currentTitle) {
                fileName = `${currentSetId}_${currentTitle}`;
            } else if (currentSetId) {
                fileName = currentSetId;
            } else if (currentTitle) {
                fileName = currentTitle;
            }
            
            downloadArticleIdsAsCsv(fileName, articleIds);
        });
    }
    
    // 저장 모달 감지 및 CSV 다운로드
    const observeModalAppearance = new MutationObserver(function(mutations) {
        if (window.modalFound) return;
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                const savePopup = node.querySelector('.save_pop_wrap') || 
                                  (node.classList && node.classList.contains('save_pop_wrap') ? node : null) ||
                                  document.querySelector('.save_pop_wrap');
                if (!savePopup) continue;
                console.log('저장 완료 모달 감지!');
                window.modalFound = true;
                if (window.downloadPending) continue;
                window.downloadPending = true;
                // 모달 노출 후 약간의 딜레이를 두고 CSV 다운로드 실행
                setTimeout(function() {
                    console.log('모달 감지 후 타임아웃 실행');
                    console.log('현재 lastNetworkSetId:', window.lastNetworkSetId);
                    
                    // 우측 영역(.datas-right) 내 컨테이너를 찾고, 없으면 전체 컨테이너를 대상으로 함
                    const rightSideContainers = document.querySelectorAll('.datas-right kv-result-container');
                    const containersList = rightSideContainers.length > 0 ? rightSideContainers : document.querySelectorAll('kv-result-container');
                    
                    console.log('컨테이너 개수:', containersList.length);
                    
                    if (containersList.length === 0) {
                        console.log('컨테이너를 찾을 수 없음');
                        window.downloadPending = false;
                        return;
                    }
                    
                    const articleIds = [];
                    containersList.forEach((container, index) => {
                        const articleId = container.getAttribute('article_id');
                        if (articleId) {
                            articleIds.push({index: index + 1, id: articleId});
                        }
                    });
                    
                    console.log('아티클 ID 개수:', articleIds.length);
                    if (articleIds.length === 0) {
                        console.log('유효한 아티클 ID가 없음');
                        window.downloadPending = false;
                        return;
                    }
                    
                    // 타이틀과 SET ID를 결합한 파일명 생성
                    let filename = 'article_ids';
                    
                    // 네트워크 요청에서 캡처된 타이틀 우선 사용
                    const currentTitle = window.lastExamNm || getTitle();
                    
                    if (window.lastNetworkSetId && 
                        (window.lastNetworkSetId.startsWith('MVSP') || 
                         !isNaN(parseInt(window.lastNetworkSetId)))) {
                        
                        // SET ID와 타이틀 모두 있는 경우
                        if (currentTitle) {
                            filename = `${window.lastNetworkSetId}_${currentTitle}`;
                        } else {
                            filename = window.lastNetworkSetId;
                        }
                        console.log('파일명으로 ID와 타이틀 결정됨:', filename);
                    } else {
                        console.log('유효한 ID가 없어 타이틀 또는 기본 파일명 사용');
                        if (currentTitle) {
                            filename = currentTitle;
                        } else {
                            // 기존 로직: 타이틀에서 파일명 추출 시도
                            try {
                                // 여러 타이틀 소스 시도
                                const dataTitleElements = [
                                    document.querySelector('.data-title'),
                                    document.querySelector('.header-title .title'),
                                    document.querySelector('.published-detail__header .title'),
                                    document.querySelector('#partTitle')
                                ];
                                
                                for (const element of dataTitleElements) {
                                    if (element) {
                                        let titleText = '';
                                        if (element.tagName === 'INPUT') {
                                            titleText = element.value;
                                        } else {
                                            titleText = element.textContent;
                                        }
                                        
                                        if (titleText && titleText.trim()) {
                                            filename = titleText.trim();
                                            console.log('요소에서 추출한 타이틀:', filename);
                                            break;
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log('타이틀 추출 실패:', e);
                            }
                        }
                    }
                    
                    downloadArticleIdsAsCsv(filename, articleIds);
                    window.downloadPending = false;
                    window.articleIdBookmarkletRunning = false;
                    observeModalAppearance.disconnect();
                }, 100);
                return;
            }
        }
    });
    
    observeModalAppearance.observe(document.body, {
        childList: true,
        subtree: true
    });
    window.existingModalObserver = observeModalAppearance;
    
    // 각 container에 Article ID 라벨 추가 (화면 내 각 header에 ID 표시 및 복사 기능)
    containers.forEach((container) => {
        if (processedContainers.has(container)) return;
        processedContainers.add(container);
        const articleId = container.getAttribute('article_id');
        if (!articleId) return;
        try {
            let headerElement = null;
            const paths = [
                function() {
                    const closestLi = container.closest('li');
                    return closestLi ? closestLi.querySelector('.header') : null;
                },
                function() {
                    const closestContent = container.closest('.content');
                    if (closestContent && closestContent.previousElementSibling) {
                        const prev = closestContent.previousElementSibling;
                        if (prev.classList.contains('header')) {
                            return prev;
                        } else if (prev.classList.contains('content_header') && prev.querySelector('.header')) {
                            return prev.querySelector('.header');
                        } else if (prev.classList.contains('flex_b') && prev.querySelector('.header')) {
                            return prev.querySelector('.header');
                        }
                    }
                    return null;
                },
                function() {
                    const dataSet = container.closest('.data-set');
                    return dataSet ? dataSet.querySelector('.header') : null;
                }
            ];
            for (let i = 0; i < paths.length; i++) {
                headerElement = paths[i]();
                if (headerElement) break;
            }
            if (!headerElement) {
                console.log(`헤더를 찾을 수 없음: ${articleId}`);
                return;
            }
            const existingLabel = headerElement.querySelector(`.article-id-label[data-id="${articleId}"]`);
            if (existingLabel) return;
            const articleSpan = document.createElement('span');
            articleSpan.className = 'article-id-label';
            articleSpan.style.backgroundColor = '#ffde00';
            articleSpan.style.padding = '2px 5px';
            articleSpan.style.marginLeft = '10px';
            articleSpan.style.borderRadius = '3px';
            articleSpan.style.fontWeight = 'bold';
            articleSpan.style.fontSize = '12px';
            articleSpan.style.cursor = 'pointer';
            articleSpan.style.display = 'inline-block';
            articleSpan.textContent = `ID: ${articleId}`;
            articleSpan.title = '클릭하여 복사';
            articleSpan.setAttribute('data-id', articleId);
            articleSpan.addEventListener('click', function(e) {
                if (e.stopPropagation) e.stopPropagation();
                navigator.clipboard.writeText(this.getAttribute('data-id'))
                    .then(() => {
                        alert(`Article ID가 클립보드에 복사되었습니다: ${this.getAttribute('data-id')}`);
                    })
                    .catch(err => {
                        const textArea = document.createElement('textarea');
                        textArea.value = this.getAttribute('data-id');
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        alert(`Article ID가 클립보드에 복사되었습니다: ${this.getAttribute('data-id')}`);
                    });
            });
            headerElement.appendChild(articleSpan);
            addedCount++;
        } catch (err) {
            console.error('오류 발생:', err);
        }
    });
    
    // 알림 메시지 표시
    const alertMessage = `${addedCount}개의 Article ID가 표시되었습니다. ID를 클릭하면 복사할 수 있습니다.`;
    alert(alertMessage);
})();
