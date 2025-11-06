import ComponentsKit
import SwiftUI

struct CompletionStepView: View {
    let next: () -> Void
    
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
                .padding(.top, 40)
            
            Text("You're All Set!")
                .font(.title)
                .fontWeight(.bold)
            
            if let nextSchedule = appState.getNextHabitSchedule() {
                Text("Next up: \(nextSchedule.message)")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else {
                Text("Your habits are ready to go!")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Spacer()
            
            SUButton(
                model: {
                    var vm = ButtonVM()
                    vm.title = "Continue"
                    vm.style = .filled
                    vm.size = .large
                    vm.isFullWidth = true
                    vm.color = .init(main: .universal(.uiColor(.systemBlue)), contrast: .white)
                    return vm
                }(),
                action: next
            )
            .padding(.horizontal)
            .padding(.bottom)
        }
        .padding(24)
    }
}

