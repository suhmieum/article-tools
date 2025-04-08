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
    
    // 세트 ID 초기화 (우측 화면과 같이 작동 시 setId를 사용)
    let setId = '';
    if (containers.length > 0) {
        setId = containers[0].getAttribute('set_id') || '';
    }
    
    // Article ID 배열 초기화 및 중복 처리 방지용 Set
    const processedContainers = new Set();
    let addedCount = 0;
    
    // CSV 파일로 아티클 ID 다운로드 함수
    function downloadArticleIdsAsCsv(fileName, articleIds) {
        console.log('다운로드 시작, 파일명:', fileName);
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const csvContent = ['순번,id'];
        
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
    
    // 세트 ID가 있는 경우 상단 배너 생성 (CSV 다운로드 버튼 포함)
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
        
        setIdBanner.innerHTML = 
            `<span>SET ID: </span>
             <span id="copyableSetId" style="cursor:pointer;text-decoration:underline;">${setId}</span> 
             (클릭하여 복사) 
             <button id="downloadCsvBtn" style="background:#fff;color:#333;border:none;padding:2px 8px;border-radius:3px;margin-left:15px;cursor:pointer;">CSV 다운로드</button> 
             <button id="closeBannerBtn" style="background:#fff;color:#333;border:none;padding:2px 8px;border-radius:3px;margin-left:15px;cursor:pointer;">닫기</button>`;
        
        document.body.appendChild(setIdBanner);
        
        // 세트 ID 클립보드 복사 기능
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
        
        // CSV 다운로드 버튼 (우측 영역에 있는 kv-result-container만 다운)
        document.getElementById('downloadCsvBtn').addEventListener('click', function() {
            // 기존 우측 영역 처리: .datas-right.auto 내부의 article id만 선택
            const rightSideContainers = document.querySelectorAll('.datas-right.auto kv-result-container');
            const ids = Array.from(rightSideContainers)
                          .map(container => container.getAttribute('article_id'))
                          .filter(id => id);
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
    
    // Fetch API 모니터링 (저장 관련 요청 감지)
    (function() {
        const originalFetch = window.fetch;
        window.fetch = async function() {
            const url = arguments[0];
            const options = arguments[1] || {};
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
    
    // **[추가] 저장 버튼에 직접 이벤트 리스너 추가 - 이 화면(스마트 문제은행)에서는 저장 버튼 클릭 시
    // 화면에 있는 모든 kv-result-container(우측에 있는 내용 또는 없으면 전체)를 대상으로 CSV 다운로드 실행**
    const saveButton = document.querySelector('.btn-save');
    if (saveButton) {
        console.log('저장 버튼 발견, 이벤트 리스너 추가 (화면 내 전체 CSV 다운로드)');
        saveButton.addEventListener('click', function() {
            console.log('저장 버튼 클릭 감지!');
            // 우측 영역에 kv-result-container가 있다면 그것만, 없으면 전체 컨테이너 대상으로
            let rightSideContainers = document.querySelectorAll('.datas-right kv-result-container');
            if (!rightSideContainers.length) {
                rightSideContainers = document.querySelectorAll('kv-result-container');
            }
            console.log('CSV 다운로드 시작, 컨테이너 개수:', rightSideContainers.length);
            const articleIds = [];
            rightSideContainers.forEach((container, index) => {
                const articleId = container.getAttribute('article_id');
                if (articleId) {
                    articleIds.push({index: index + 1, id: articleId});
                }
            });
            if (articleIds.length === 0) {
                alert("저장할 Article ID가 없습니다.");
                return;
            }
            // 파일명: 우측 영역에 제목(data-title)이 있으면 사용, 없으면 기본명
            let fileName = "article_ids";
            const dataTitleElement = document.querySelector('.datas-right .data-head .data-title');
            if (dataTitleElement && dataTitleElement.textContent.trim()) {
                fileName = dataTitleElement.textContent.trim().replace(/\s/g, '_');
            }
            downloadArticleIdsAsCsv(fileName, articleIds);
        });
    }
    
    // 저장 모달 감지 및 CSV 다운로드 (우측 영역 처리)
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
                    const rightSideContainers = document.querySelectorAll('.datas-right kv-result-container');
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
                    let filename = 'article_ids';
                    if (window.lastNetworkSetId && 
                        (window.lastNetworkSetId.startsWith('MVSP') || 
                         !isNaN(parseInt(window.lastNetworkSetId)))) {
                        filename = window.lastNetworkSetId;
                        console.log('파일명으로 사용할 ID 결정됨:', filename);
                    } else {
                        console.log('유효한 ID가 없어 기본 파일명 사용');
                        const titleElement = savePopup.querySelector('.title');
                        if (titleElement && titleElement.textContent === '저장 완료') {
                            console.log('저장 완료 타이틀 발견');
                            try {
                                const dataTitle = document.querySelector('.data-title');
                                if (dataTitle) {
                                    const titleText = dataTitle.textContent;
                                    console.log('데이터 타이틀 발견:', titleText);
                                    if (titleText.includes('_')) {
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
    
    alert(`${addedCount}개의 Article ID가 표시되었습니다. ID를 클릭하면 복사할 수 있습니다.`);
})();
