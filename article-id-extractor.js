javascript:(function(){
    
    // 기존 옵저버 정리
    if (window.existingModalObserver) {
        window.existingModalObserver.disconnect();
        window.existingModalObserver = null;
    }
    
    // 전역 변수 설정
    window.lastNetworkSetId = '';
    window.downloadPending = false;
    window.modalFound = false;
    
    console.log('북마클릿 시작. 버전: 직접 요청 감시');
    
    // 기본 변수 설정
    const containers = document.querySelectorAll('kv-result-container');
    if (containers.length === 0) {
        alert('이 페이지에서는 아티클 ID를 찾을 수 없습니다.');
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
    
    // 세트 ID 초기화
    let setId = '';
    if (containers.length > 0) {
        setId = containers[0].getAttribute('set_id') || '';
    }
    
    // Article ID 배열 초기화 및 중복 처리 방지용 Set
    const processedContainers = new Set();
    let addedCount = 0;
    
    // CSV 파일로 아티클 ID 다운로드
    function downloadArticleIdsAsCsv(setId, articleIds) {
        console.log('다운로드 시작, 파일명:', setId);
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const csvContent = ['순번,id'];
        
        articleIds.forEach((item, idx) => {
            if (typeof item === 'object' && item.id) {
                csvContent.push(`${item.index},${item.id}`);
            } else {
                csvContent.push(`${idx+1},${item}`);
            }
        });
        
        const csvString = csvContent.join('\n');
        const blob = new Blob([bom, csvString], {type: 'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${setId || 'article_ids'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`CSV 파일 다운로드 완료: ${setId}.csv (${articleIds.length}개 아티클)`);
    }
    
    // 세트 ID가 있는 경우 상단 배너 생성
    if (setId) {
        const setIdBanner = document.createElement('div');
        setIdBanner.id = 'article-id-top-banner';
        setIdBanner.style.position = 'fixed';
        setIdBanner.style.top = '0';
        setIdBanner.style.left = '0';
        setIdBanner.style.width = '100%';
        setIdBanner.style.background = '#4a90e2';
        setIdBanner.style.color = 'white';
        setIdBanner.style.padding = '8px';
        setIdBanner.style.zIndex = '9999';
        setIdBanner.style.textAlign = 'center';
        setIdBanner.style.fontWeight = 'bold';
        
        setIdBanner.innerHTML = `
            <span>SET ID: </span>
            <span id="copyableSetId" style="cursor:pointer;text-decoration:underline;">${setId}</span> 
            (클릭하여 복사) 
            <button id="downloadCsvBtn" style="background:#fff;color:#333;border:none;padding:2px 8px;border-radius:3px;margin-left:15px;cursor:pointer;">CSV 다운로드</button> 
            <button id="closeBannerBtn" style="background:#fff;color:#333;border:none;padding:2px 8px;border-radius:3px;margin-left:15px;cursor:pointer;">닫기</button>
        `;
        
        document.body.appendChild(setIdBanner);
        
        // 세트 ID 클립보드 복사
        document.getElementById('copyableSetId').addEventListener('click', function() {
            navigator.clipboard.writeText(setId)
                .then(() => {
                    alert('Set ID가 클립보드에 복사되었습니다: ' + setId);
                })
                .catch(err => {
                    // 폴백: 클립보드 API가 실패한 경우 document.execCommand 사용
                    const textArea = document.createElement('textarea');
                    textArea.value = setId;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('Set ID가 클립보드에 복사되었습니다: ' + setId);
                });
        });
        
        // CSV 다운로드 버튼
        document.getElementById('downloadCsvBtn').addEventListener('click', function() {
            const ids = Array.from(containers).map(container => 
                container.getAttribute('article_id')).filter(id => id);
            downloadArticleIdsAsCsv(setId, ids);
        });
        
        // 배너 닫기 버튼
        document.getElementById('closeBannerBtn').addEventListener('click', function() {
            const banner = document.getElementById('article-id-top-banner');
            if (banner) {
                document.body.removeChild(banner);
            }
        });
    }
    
    // XHR 요청을 직접 모니터링하는 대신 Fetch API도 모니터링
    (function() {
        // 원본 fetch 함수 저장
        const originalFetch = window.fetch;
        
        // fetch 오버라이드
        window.fetch = async function() {
            const url = arguments[0];
            const options = arguments[1] || {};
            
            // 원본 fetch 호출
            const response = await originalFetch.apply(this, arguments);
            
            // 저장 관련 URL 패턴 확인 (모든 가능한 패턴)
            if ((typeof url === 'string' && 
                (url.includes('/sets/save') || 
                 url.includes('setSummaryForSave') || 
                 url.includes('/api/') || 
                 url.includes('/save'))) ||
                (options.method === 'POST' || options.method === 'post')) {
                
                console.log('fetch 요청 감지:', url);
                
                // 응답 복제 (Response 객체는 한 번만 사용 가능)
                const clone = response.clone();
                
                // 비동기로 응답 처리
                clone.json().then(data => {
                    console.log('fetch 응답:', data);
                    
                    // 응답에서 setsId 찾기 (모든 가능한 경로)
                    let setsId = null;
                    
                    // paramData.setsId 경로 확인
                    if (data && data.paramData && data.paramData.setsId) {
                        setsId = data.paramData.setsId;
                        console.log('fetch 응답에서 paramData.setsId 발견:', setsId);
                    } 
                    // 최상위 setsId 경로 확인
                    else if (data && data.setsId) {
                        setsId = data.setsId;
                        console.log('fetch 응답에서 setsId 발견:', setsId);
                    }
                    // resultData.setsId 경로 확인
                    else if (data && data.resultData && data.resultData.setsId) {
                        setsId = data.resultData.setsId;
                        console.log('fetch 응답에서 resultData.setsId 발견:', setsId);
                    }
                    
                    // setsId 발견한 경우 저장
                    if (setsId) {
                        window.lastNetworkSetId = setsId;
                        
                        // 상단 배너 업데이트
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
    
    // XMLHttpRequest 인터셉터 (기본적인 XHR도 모니터링)
    (function() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function() {
            this._url = arguments[1] || '';
            this._method = arguments[0] || '';
            return originalOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function() {
            // 저장 관련 URL 패턴에 해당하는 경우
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
                            
                            // 응답에서 setsId 찾기 (모든 가능한 경로)
                            let setsId = null;
                            
                            // paramData.setsId 경로 확인
                            if (data && data.paramData && data.paramData.setsId) {
                                setsId = data.paramData.setsId;
                                console.log('XHR 응답에서 paramData.setsId 발견:', setsId);
                            } 
                            // 최상위 setsId 경로 확인
                            else if (data && data.setsId) {
                                setsId = data.setsId;
                                console.log('XHR 응답에서 setsId 발견:', setsId);
                            }
                            // resultData.setsId 경로 확인
                            else if (data && data.resultData && data.resultData.setsId) {
                                setsId = data.resultData.setsId;
                                console.log('XHR 응답에서 resultData.setsId 발견:', setsId);
                            }
                            
                            // setsId 발견한 경우 저장
                            if (setsId) {
                                window.lastNetworkSetId = setsId;
                                
                                // 상단 배너 업데이트
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
    
    // 저장 버튼에 직접 이벤트 리스너 추가 (버튼이 존재할 경우)
    const saveButton = document.querySelector('.btn-save');
    if (saveButton) {
        console.log('저장 버튼 발견, 이벤트 리스너 추가');
        
        saveButton.addEventListener('click', function() {
            console.log('저장 버튼 클릭 감지!');
            
            // 클릭 시 현재 URL 확인 및 저장
            const currentUrl = window.location.href;
            console.log('현재 URL:', currentUrl);
        });
    }
    
    // 저장 모달이 나타날 때 세트 ID 캡처 및 CSV 다운로드
    const observeModalAppearance = new MutationObserver(function(mutations) {
        if (window.modalFound) return;
        
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
            
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                
                // 저장 완료 모달 확인 (다양한 선택자 시도)
                const savePopup = node.querySelector('.save_pop_wrap') || 
                                  (node.classList && node.classList.contains('save_pop_wrap') ? node : null) ||
                                  document.querySelector('.save_pop_wrap');
                
                if (!savePopup) continue;
                
                console.log('저장 완료 모달 감지!');
                window.modalFound = true;
                
                if (window.downloadPending) continue;
                window.downloadPending = true;
                
                // 모달이 나타난 후 setsId가 업데이트될 시간 확보
                setTimeout(function() {
                    console.log('모달 감지 후 타임아웃 실행');
                    console.log('현재 lastNetworkSetId:', window.lastNetworkSetId);
                    
                    const rightSideContainers = document.querySelectorAll(
                        '.datas-right .data-set li kv-result-container, ' + 
                        '.data-scroll-cover .data-set li kv-result-container'
                    );
                    console.log('컨테이너 개수:', rightSideContainers.length);
                    
                    if (rightSideContainers.length === 0) {
                        console.log('컨테이너를 찾을 수 없음');
                        window.downloadPending = false;
                        return;
                    }
                    
                    const articleIds = [];
                    rightSideContainers.forEach((container, index) => {
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
                    
                    // 파일명으로 사용할 ID 결정
                    let filename = 'article_ids';
                    
                    if (window.lastNetworkSetId && 
                        (window.lastNetworkSetId.startsWith('MVSP') || 
                         !isNaN(parseInt(window.lastNetworkSetId)))) {
                        filename = window.lastNetworkSetId;
                        console.log('파일명으로 사용할 ID 결정됨:', filename);
                    } else {
                        console.log('유효한 ID가 없어 기본 파일명 사용');
                        
                        // 작업 완료 메시지에서 직접 ID 추출 시도
                        const titleElement = savePopup.querySelector('.title');
                        if (titleElement && titleElement.textContent === '저장 완료') {
                            console.log('저장 완료 타이틀 발견');
                            
                            // 직접 ID 추출 시도
                            try {
                                // 페이지에서 다른 요소에서 ID 찾기 시도
                                const dataTitle = document.querySelector('.data-title');
                                if (dataTitle) {
                                    const titleText = dataTitle.textContent;
                                    console.log('데이터 타이틀 발견:', titleText);
                                    
                                    // 타이틀에서 몇 가지 패턴으로 ID 추출 시도
                                    if (titleText.includes('_')) {
                                        // 예: "중학_사회 ①_1-2_형성 평가"
                                        const parts = titleText.split('_');
                                        if (parts.length >= 3) {
                                            filename = parts.join('_').replace(/\s/g, '');
                                            console.log('타이틀에서 추출한 ID:', filename);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log('ID 추출 실패:', e);
                            }
                        }
                    }
                    
                    // 중복 다운로드 방지를 위해 한 번만 다운로드
                    downloadArticleIdsAsCsv(filename, articleIds);
                    
                    // 플래그 재설정 및 옵저버 중지
                    window.downloadPending = false;
                    window.articleIdBookmarkletRunning = false;
                    observeModalAppearance.disconnect();
                    
                }, 100);
                
                return;
            }
        }
    });
    
    // DOM 변경 관찰 시작
    observeModalAppearance.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // 참조 저장 (나중에 정리를 위해)
    window.existingModalObserver = observeModalAppearance;
    
    // 각 container에 Article ID 라벨 추가
    containers.forEach((container) => {
        if (processedContainers.has(container)) return;
        processedContainers.add(container);
        
        const articleId = container.getAttribute('article_id');
        if (!articleId) return;
        
        try {
            let headerElement = null;
            
            // 다양한 DOM 구조에서 헤더 요소 찾기
            const paths = [
                function() {
                    const closestLi = container.closest('li');
                    if (closestLi) {
                        return closestLi.querySelector('.header');
                    }
                    return null;
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
                    if (dataSet) {
                        return dataSet.querySelector('.header');
                    }
                    return null;
                }
            ];
            
            // 각 경로 시도
            for (let i = 0; i < paths.length; i++) {
                headerElement = paths[i]();
                if (headerElement) break;
            }
            
            if (!headerElement) {
                console.log(`헤더를 찾을 수 없음: ${articleId}`);
                return;
            }
            
            // 중복 방지
            const existingLabel = headerElement.querySelector(`.article-id-label[data-id="${articleId}"]`);
            if (existingLabel) return;
            
            // 라벨 생성 및 스타일링
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
            
            // 클릭 이벤트: ID 복사
            articleSpan.addEventListener('click', function(e) {
                if (e.stopPropagation) e.stopPropagation();
                
                navigator.clipboard.writeText(this.getAttribute('data-id'))
                    .then(() => {
                        alert(`Article ID가 클립보드에 복사되었습니다: ${this.getAttribute('data-id')}`);
                    })
                    .catch(err => {
                        // 폴백: 클립보드 API가 실패한 경우 document.execCommand 사용
                        const textArea = document.createElement('textarea');
                        textArea.value = this.getAttribute('data-id');
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        alert(`Article ID가 클립보드에 복사되었습니다: ${this.getAttribute('data-id')}`);
                    });
            });
            
            // DOM에 라벨 추가
            headerElement.appendChild(articleSpan);
            addedCount++;
        } catch (err) {
            console.error('오류 발생:', err);
        }
    });
    
    // 초기 알림
    alert(`${addedCount}개의 Article ID가 표시되었습니다. ID를 클릭하면 복사할 수 있습니다.`);
})();
