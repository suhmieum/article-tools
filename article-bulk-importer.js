javascript:(function(){
    // 페이지에 있는 모든 '추가' 버튼을 선택
    const addButtons = document.querySelectorAll('.btn.btn-default.icon.plus_b.line_blue2.add');
    let addedCount = 0;
    
    if (addButtons.length === 0) {
        alert('추가할 문항이 없습니다. [문항 검색]에서 실행해 주세요.');
        return;
    }
    
    // 순차적으로 모든 버튼 클릭
    for (let i = 0; i < addButtons.length; i++) {
        // 버튼이 화면에 표시되어 있고 클릭 가능한 상태인지 확인
        if (addButtons[i].offsetParent !== null && !addButtons[i].disabled) {
            addButtons[i].click();
            addedCount++;
        }
    }
    
    // 작업 완료 알림
    alert(`일괄 추가 완료! ${addedCount}개 문항이 추가되었습니다.`);
})();
