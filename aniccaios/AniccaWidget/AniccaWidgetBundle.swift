//
//  AniccaWidgetBundle.swift
//  AniccaWidget
//
//  Created by CBNS03 on 2025/12/07.
//

import WidgetKit
import SwiftUI

@main
struct AniccaWidgetBundle: WidgetBundle {
    var body: some Widget {
        AniccaWidget()
        AniccaWidgetControl()
        AniccaWidgetLiveActivity()
        
        // AlarmKit用のLive Activity（iOS 26以上）
        if #available(iOS 26.0, *) {
            AniccaAlarmLiveActivity()
        }
    }
}
