javascript:(function(){
    // 현재 추가된 문항 수 확인
    const currentItems = document.querySelectorAll('.datas-right .data-set li').length;
    const maxAllowed = 50; // 최대 허용 문항 수
    
    // 추가 가능한 문항 수 계산
    const remainingSlots = maxAllowed - currentItems;
    
    if (remainingSlots <= 0) {
        alert(`최대 문항 수(50개)에 도달했습니다. 더 이상 추가할 수 없습니다.`);
        return;
    }
    
    // 페이지에 있는 모든 '추가' 버튼을 선택
    const addButtons = document.querySelectorAll('.btn.btn-default.icon.plus_b.line_blue2.add');
    
    if (addButtons.length === 0) {
        alert('추가할 문항이 없습니다.');
        return;
    }
    
    // 추가할 문항 수 결정 (남은 슬롯과 가용 버튼 중 적은 수)
    const buttonsToClick = Math.min(remainingSlots, addButtons.length);
    let clickedCount = 0;
    
    // 순차적으로 버튼 클릭
    for (let i = 0; i < buttonsToClick; i++) {
        // 버튼이 화면에 표시되어 있고 클릭 가능한 상태인지 확인
        if (addButtons[i].offsetParent !== null && !addButtons[i].disabled) {
            addButtons[i].click();
            clickedCount++;
        }
    }
    
    // 작업 완료 알림
    if (clickedCount > 0) {
        // 상황에 따른 메시지
        if (buttonsToClick < addButtons.length) {
            alert(`총 ${clickedCount}개 문항 추가를 시도합니다.\n\n※ 최대 50개까지만 추가 가능하여 일부 문항만 처리했습니다.`);
        } else {
            alert(`총 ${clickedCount}개 문항 추가를 시도합니다.`);
        }
    } else {
        alert('추가할 수 있는 문항이 없습니다.');
    }
})();
